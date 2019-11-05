/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2018 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 *  NOTICE:  All information contained herein is, and remains
 *  the property of Adobe Systems Incorporated and its suppliers,
 *  if any.  The intellectual and technical concepts contained
 *  herein are proprietary to Adobe Systems Incorporated and its
 *  suppliers and are protected by trade secret or copyright law.
 *  Dissemination of this information or reproduction of this material
 *  is strictly forbidden unless prior written permission is obtained
 *  from Adobe Systems Incorporated.
 */

'use strict';

// Nui asset worker library
// WARN: this code needs to be cleaned up and reworked. It is still based on the Nui
//       proof of concept. Its issues are known.

const proc = require('process');

const { GenericError, Reason } = require('@nui/asset-compute-commons');

// from src/libraries
// TODO: General import for all this, once dependencies have been minimized and encapsulated

const shellRunner = require('./lib/shell/shellscript');
const fileUtils = require('./lib/utils/file-utils');
const timerUtils = require('./lib/utils/timer');
const eventUtils = require('./lib/utils/events-utils');
const metricsUtils = require('./lib/utils/metrics-utils');
const renditionProcess = require('./lib/rendition-process/rendition-process');
const renditionHelper = require('./lib/rendition-process/rendition-helper');

// -----------------------< event handlers >------------------------------------------
/*function getEventHandler(params){
    return eventUtils.getEventHandler(params);
}*/
// -----------------------< core processing logic >-----------------------------------
async function cleanup(err, context, scheduledEvents) {
    for(let i = 0; i < scheduledEvents.length; i++){
        clearTimeout(scheduledEvents[i]);
    }
    if (err) console.error(err);

    try {
        if (context.indir) await fileUtils.remove(context.indir);
        if (context.outdir) {
            if (context.isLocalFile) {
                // TODO: remove just file?
            } else {
                await fileUtils.remove(context.outdir);
            }
        }
    } catch(e) {
        console.error("error during cleanup:", e.message || e);
    }
}

function process(params, options, workerFnAsync) {
    // prepare options
    if (typeof options === "function") {
        workerFnAsync = options;
        options = {};
    }
    options = options || {};
    options.dir = options.dir || ".";

    // set up metrics
    const timers = {};
    const metrics = {};
    timers.duration = timerUtils.timer_start();

    // metrics scheduling
    const osMetricsTimeoutId = metricsUtils.scheduleOSMetrics(metrics);
    const timeoutId = metricsUtils.scheduleTimeoutMetrics(metrics, timers);
    const scheduledMetrics = [osMetricsTimeoutId, timeoutId];

    return new Promise(async function(resolve, reject) {
        const context = {};
        try {
            // PHASE 1 - PREPARE
            try{
                const source = await renditionProcess.createInDirectory(context, options, params);
                await renditionProcess.createOutDirectory(context, options, params);

                timers.download = timerUtils.timer_start();

                await renditionProcess.download(params, options, context, source);

                // Only set metrics if we really did a download
                if (renditionProcess.isUrlDownload()) {
                    try {
                        metrics.downloadInSeconds = parseFloat(timerUtils.timer_elapsed_seconds(timers.download));
                    } catch(e) {
                        console.error("error getting timing metrics:", e.message || e);
                    }
                    console.log("END download for ingestionId", params.ingestionId, "file", context.infile);
                    const stats = fileUtils.statSync(context.infile);
                    metrics.sourceSize = stats.size;
                    metrics.sourceName = context.infilename;
                    metrics.sourceMimetype = source.mimeType;
                }
            } catch(err){
                eventUtils.sendError(params, err, metrics, "download_error"); // fire and forget
                await cleanup(err, context, scheduledMetrics);
                return reject(err);
            }

            // PHASE 2 - RUN RENDITION PROCESS
            try{
                timers.processing = timerUtils.timer_start();

                context.workerResult = await renditionProcess.executeWorker(context.infile,
                                                                            params,
                                                                            context.outdir,
                                                                            options.processingOptions,
                                                                            workerFnAsync);
                console.log("workerResult", context.workerResult);

                try {
                    metrics.processingInSeconds = parseFloat(timerUtils.timer_elapsed_seconds(timers.processing));
                } catch(e) {
                    console.error("error getting timing metrics:", e.message || e);
                }
            } catch(err){
                eventUtils.sendError(params, err, metrics, "worker_error"); // fire and forget
                await cleanup(err, context, scheduledMetrics);
                // This is where we will catch the errors that happen inside the workers. We need to figure
                // out if we will throw the specific error types in workers or not. Library needs to know
                // what kind of error it was to pass along as `errorReason` for events/metrics
                if (err.reason in Reason || err instanceof GenericError) {
                    return reject(err);
                }
                return reject(new GenericError(err.message || err, `${proc.env.__OW_ACTION_NAME.split('/').pop()}_processing`));
            }

            try{
                // collect generated files
                const count = await renditionProcess.collectRenditionFiles(context);

                // Strange situation where worker didn't fail and yet there are no renditions
                if (count === 0) {
                    return reject(new GenericError("No generated renditions found.", "worker_result"));
                }

                await renditionProcess.uploadRenditionFiles(params, context);
                console.log(JSON.stringify(context));
            } catch(err){
                eventUtils.sendError(params, err, metrics, "library_processing_error"); // fire and forget
                await cleanup(err, context, scheduledMetrics);
                return reject(err);
            }

            // from now on, there is at least one rendition generated
            // PHASE 3 - SEND METRICS (and then resolve)
            try {
                metrics.uploadInSeconds = parseFloat(timerUtils.timer_elapsed_seconds(timers.upload));
            } catch(e) {
                console.error("error getting timing metrics:", e.message || e);
            }
            console.log("download of source file took", metrics.downloadInSeconds, "seconds");
            console.log("processing of all renditions took", metrics.processingInSeconds, "seconds");
            console.log("uploading of all renditions took", metrics.uploadInSeconds, "seconds");

            try {
                if (!Array.isArray(params.renditions)) {
                    await Promise.all(params.renditions.map(rendition => {
                        try {
                            metrics.duration = parseFloat(timerUtils.timer_elapsed_seconds(timers.duration));
                        } catch(e) {
                            console.error("error getting timing metrics:", e.message || e);
                        }
                        return metricsUtils.sendRenditionMetrics(rendition, params, context, metrics, eventUtils.getEventHandler(params));
                    }));
                }
            } catch(err) {
                console.error("error sending timing metrics:", err.message || err);
            }

            await cleanup(null, context, scheduledMetrics); // cannot throw (swallows exceptions)

            delete params.newRelicApiKey;
            return resolve({
                ok: true,
                renditions: context.renditions,
                workerResult: context.workerResult,
                params: params,
                metrics: metrics
            });

        } catch (err) {
            // overall try catch statement to catch unknown library errors
            eventUtils.sendError(params, err, metrics, "library_unexpected_error");
            await cleanup(err, context, scheduledMetrics);
            return reject(`unexpected error in worker library: ${err}`);
        }
    });
}

// -----------------------< helper for workers that do one rendition at a time >-----------------------------------
const forEachRendition = function(params, options, renditionFn) {
    if (typeof options === "function") {
        renditionFn = options;
        options = {};
    }

    options.processingOptions = {
        renditionFn: renditionFn,
        parallel: options.parallel
    };

    return process(params, options, renditionHelper.doRenditionHandlingAsync);
}

// -----------------------< new relic metrics >---------------------------------------
/*function sendNewRelicMetrics(params, metrics) {
    return new Promise(resolve => {
        // We still want to continue the action even if there is an error in sending metrics to New Relic
        if (!params.newRelicEventsURL || !params.newRelicApiKey) {
            console.error('Missing NewRelic events Api Key or URL. Metrics disabled.');
            return(resolve());
        }
        try {
            const fullActionName = proc.env.__OW_ACTION_NAME? proc.env.__OW_ACTION_NAME.split('/'): [];

            metrics.actionName = fullActionName.pop();
            metrics.namespace = proc.env.__OW_NAMESPACE;
            metrics.activationId = proc.env.__OW_ACTIVATION_ID;
            metrics.ingestionId = params.ingestionId;
            if (fullActionName.length > 2) {
                metrics.package = fullActionName.pop();
            }

            if (params.auth) {
                try {
                    metrics.orgId = params.auth.orgId;
                    const jwt = jsonwebtoken.decode(params.auth.accessToken);
                    metrics.clientId = jwt ? jwt.client_id : undefined;
                }
                catch (e) {
                    console.log(e.message || e);
                }
            }

            return zlib.gzip(JSON.stringify(metrics), function (_, result) {
                request.post({
                    headers: {
                        'content-type': 'application/json',
                        'X-Insert-Key': params.newRelicApiKey,
                        'Content-Encoding': 'gzip' },
                    url:     params.newRelicEventsURL,
                    body:    result
                }, function(err, res, body){
                    if (err) {
                        console.log('Error sending request to NewRelic', err.message || err);
                    } else if (res.statusCode !== 200) {
                        console.log('NewRelic events submission error. Check response code:', res.statusCode);
                    } else {
                        console.log('Event sent to NewRelic', body);
                    }
                    // promise always resolves so failure of sending metrics does not cause action to fail
                    resolve();
                });
            });
        } catch (error) {
            // catch all error
            console.error('Error sending metrics to NewRelic.', error.message || error);
            resolve();

        }
    })
}*/

// -----------------------< shell script support >-----------------------------------
// TODO: support shell script worker with all renditions at once
//       passing array of $rendition, e.g.
//
//          `convert-app $file $rendition[0] $rendition[1] $rendition[2]`
//
//       question would be how one can easily loop this in a shell script, including rendition_fmt arguments
//       Note that the whole point of the shell script worker is that it is super simple
//       for developers and the command is easily readable (as compared to very hidden
//       inside some strings in js code for example).

function shellScriptWorker(shellScriptName) {
    // inject foreachRendition to define the forEachRendition to use
    return function(params) {
        return shellRunner.shellScript(params, forEachRendition, shellScriptName);
    };
}

// -----------------------< exports >-----------------------------------
module.exports = {
    process, // for node.js workers
    forEachRendition, // for node.js workers, on top of process
    shellScriptWorker // all shellscript workers
}