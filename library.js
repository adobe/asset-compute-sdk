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

const url = require('url');
const fs = require('fs-extra');
const sizeOf = require('image-size');
const path = require('path');
const { exec, execSync } = require('child_process');
const proc = require('process');
const validUrl = require('valid-url');
const { AdobeIOEvents } = require('@nui/adobe-io-events-client');
const jsonwebtoken = require('jsonwebtoken');
const request = require('request');
const zlib = require('zlib');
const cgroup = require('cgroup-metrics');
const memory = cgroup.memory();
const { GenericError, Reason } = require ('./errors.js');

// different storage access
const http = require('./src/storage/http');
// const httpMultipart = require('./src/storage/http-multipart'); // right now this is not being used
const local = require('./src/storage/local');

let currentlyProcessing = false;

// -----------------------< utils >-----------------------------------

const DEFAULT_SOURCE_FILE = "source.file";
const METRIC_FETCH_INTERVAL_MS = 100;

// There is at least one worker (graphics magick) that in some cases depends
// upon the file extension so it is best to use source.name if that is
// defined
function filename(source) {
    if (typeof source === 'string') {
        source = { url: source };
    }

    if (source.name) {
        return source.name;
    }

    if (source.url) {
        return path.basename(url.parse(source.url).pathname) || DEFAULT_SOURCE_FILE;
    }

    return DEFAULT_SOURCE_FILE;
}

function timer_start() {
    return proc.hrtime();
}

function timer_elapsed_seconds(time) {
    const elapsed = proc.hrtime(time);
    return (elapsed[0] + (elapsed[1] / 1e9)).toFixed(3);
}

// -----------------------< events >--------------------------------------------------

function getEventHandler(params) {
    if (params.auth && params.auth.accessToken && params.auth.orgId) {
        const auth = params.auth;

        const jwt = jsonwebtoken.decode(auth.accessToken);
        if (!jwt) {
            console.error("invalid accessToken: ", params.auth);
            return {
                sendEvent: function() {
                    return Promise.resolve();
                }
            }
        }
        const providerId = `asset_compute_${auth.orgId}_${jwt.client_id}`;

        const ioEvents = new AdobeIOEvents({
            accessToken: auth.accessToken,
            orgId: auth.orgId,
            defaults: {
                providerId: providerId
            }
        });

        return {
            sendEvent: async function(type, payload) {
                try {
                    console.log("sending event", type, "as", providerId);
                    await ioEvents.sendEvent({
                        code: "asset_compute",
                        payload: Object.assign(payload || {}, {
                            type: type,
                            date: new Date().toISOString(),
                            requestId: params.requestId || params.ingestionId || proc.env.__OW_ACTIVATION_ID,
                            source: params.source.url || params.source,
                            userData: params.userData
                        })
                    })
                    console.log("successfully sent event");
                } catch (e) {
                    console.error("error sending event:", e.message || e);
                    await sendNewRelicMetrics(params, {
                        eventType: "error",
                        reason: Reason.GenericError,
                        location: "IOEvents",
                        message: `Error sending IO event: ${e.message || e}`
                    });
                }
            },
            sendErrorEvent: async function(type, payload, errorMetrics) {
                try {
                    console.log("sending event", type, "as", providerId);
                    await sendNewRelicMetrics(params, errorMetrics || { eventType: type });
                    await ioEvents.sendEvent({
                        code: "asset_compute",
                        payload: Object.assign(payload || {}, {
                            type: type,
                            date: new Date().toISOString(),
                            requestId: params.requestId || params.ingestionId || proc.env.__OW_ACTIVATION_ID,
                            source: params.source.url || params.source,
                            userData: params.userData
                        })
                    });
                    console.log("successfully sent error events and metrics");

                } catch (e) {
                    console.error("error sending event:", e.message || e);
                    await sendNewRelicMetrics(params, {
                        eventType: "error",
                        reason: Reason.GenericError,
                        location: "IOEvents",
                        message: `Error sending IO event: ${e.message || e}`
                    });

                }
                    
               
            }
        }

    } else {
        // TODO: do not log tokens
        console.error("`auth` missing or incomplete in request, cannot send events: ", params.auth);
        return {
            sendEvent: async function(type, payload) {
                // Logging info about event is useful when running in test environments
                console.log("Following event is not sent:", type, JSON.stringify(payload));
            },
            sendErrorEvent: async function(type, payload, errorMetrics) {
                // Logging info about event is useful when running in test environments
                console.log("Following event is not sent:", type, JSON.stringify(payload));
                await sendNewRelicMetrics(params, errorMetrics || { eventType: type }); // still should send error metrics
            }
        }
    }
}

// -----------------------< new relic metrics >---------------------------------------

function sendNewRelicMetrics(params, metrics) {
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
}

// -----------------------< memory metric collection function >-----------------------------------

function startSchedulingMetrics(params, metrics) {
    function scheduleOSMetricsCollection() {
        setTimeout( updateMemoryMetrics, METRIC_FETCH_INTERVAL_MS);
    }
    
    async function updateMemoryMetrics() {
            const currUsage = await memory.containerUsage();
            
            if (!metrics.containerUsage || currUsage > metrics.containerUsage) {
                
                metrics.containerUsage = currUsage;   
                const currPercentage = await memory.containerUsagePercentage(currUsage);
                
                if (!metrics.containerUsagePercentage || currPercentage > metrics.containerUsagePercentage) {
                    
                    metrics.containerUsagePercentage = currPercentage;
                }
            }
        if (currentlyProcessing) {
            scheduleOSMetricsCollection();
        }
    }

    scheduleOSMetricsCollection();
    
}

// -----------------------< check action timeout and send metrics function >-----------------------------------

function scheduleTimeoutMetrics(params, metrics, timers) {
    const timeTillTimeout = proc.env.__OW_DEADLINE - Date.now();
    return setTimeout(
        () => {
            console.log(`${proc.env.__OW_ACTION_NAME} will timeout in ${proc.env.__OW_DEADLINE - Date.now()} milliseconds. Sending metrics before action timeout.`);
            if (!(metrics.duration))  { metrics.duration =  parseFloat(timer_elapsed_seconds(timers.duration)); } // set duration metrics if not already set
            return sendNewRelicMetrics(params, Object.assign( metrics || {} , { eventType: "timeout"})).then(() => {
                console.log(`Metrics sent before action timeout.`);
            })
        }, 
       timeTillTimeout - 100
    ); 
}

// -----------------------< core processing logic >-----------------------------------

function cleanup(err, context, timeoutId) {
    currentlyProcessing = false;
    clearTimeout(timeoutId);
    try {
        if (err) console.error(err);
        if (context.indir) fs.removeSync(context.indir);
        if (context.outdir) {
            if (context.isLocalFile) {
                // TODO: remove just file?
            } else {
                fs.removeSync(context.outdir);
            }
        }
    } catch(e) {
        console.error("error during cleanup:", e.message || e);
    }
}

function process(params, options, workerFn) {
    if (typeof options === "function") {
        workerFn = options;
        options = {};
    }
    options.dir = options.dir || ".";

    const context = {};
    const timers = {};
    const metrics = {};
    timers.duration = timer_start();
    
    // update memory metrics and check if close to action timeout every 100ms
    currentlyProcessing = true;
    startSchedulingMetrics(params, metrics);
    const timeoutId = scheduleTimeoutMetrics(params, metrics, timers);

    /*
        TODO: phases to turn into promises

        TODO: optimization: support upload of renditions once they are finished
              and while others are still being processed (if using forEachRendition())

        0. prepare()
            - create directories
            - select download mechanism (http, local, ...)

        1. download()
            - invoke download

        2. prepareOutDir()
            - TODO: move to 0 prepare()

        3. process()
            - run worker processing

        4. collect()
            - collect renditions

        5. upload()
            - upload renditions

        6. finish()
            - end timers
            - log results
            - send events for renditions
            - send new relic events for metrics
            - return result info (not important in async model)

        X. catch()
            - catch errors
            - send error events
     */

    return new Promise(function(resolve, reject) {
        try {

            // 0. create in dir
            context.indir = path.join(options.dir, "in");
            fs.removeSync(context.indir);
            fs.mkdirsSync(context.indir);
            console.log("indir:", path.resolve(context.indir));

            let download;

            let source = params.source;
            if (source === undefined) {
                return reject(new GenericError("No 'source' in params. Required for asset workers.", `${proc.env.__OW_ACTION_NAME.split('/').pop()}_pre_download`));
            }
            if (typeof source === 'string') {
                params.source = source = { url: source };
            }

            context.infilename = filename(source);
            context.infile = path.join(context.indir, context.infilename);

            // 1. download source file
            let downloadedFromUrl = false;
            if (source.url) {
                if (validUrl.isUri(source.url)) {
	            if (options.disableSourceDownloadSource) {
                        context.infile = source.url;
                        console.log(`infile is url: ${context.infile}`);
                        download = Promise.resolve(context);
                    } else {
                        console.log("START download for ingestionId", params.ingestionId, "file", context.infile);
                        // download http/https url into file
                        download = http.download(params, context);
                        downloadedFromUrl = true;
                    }


                } else {
                    // possibly local file mounted on the docker image - for unit testing
                    download = local.download(params, context);
                }
            } else {
                return reject(new GenericError("Source as string or source.url is required", `${proc.env.__OW_ACTION_NAME.split('/').pop()}_pre_download`));
            }

            timers.download = timer_start();

            download.then(function(context) {
                
               const downloadInSeconds = parseFloat(timer_elapsed_seconds(timers.download));

               // Only set metrics if we really did a download
               if (downloadedFromUrl) {
                    console.log("END download for ingestionId", params.ingestionId, "file", context.infile);
                    metrics.downloadInSeconds = downloadInSeconds;
                    const stats = fs.statSync(context.infile);
                    metrics.sourceSize = stats.size;
               }

                // 2. prepare out dir

                if (context.isLocalFile) {
                    // TODO: check that rendition names are safe and not a URL?
                    context.outdir = "/out";
                } else {
                    context.outdir = path.join(options.dir, "out");
                    fs.removeSync(context.outdir);
                    fs.mkdirsSync(context.outdir);
                }
                console.log("outdir:", path.resolve(context.outdir));

                // --------------------------------------------------------

                // 3. run worker (or get worker promise)
                try {
                    timers.processing = timer_start();

                    const workerResult = workerFn(context.infile, params, context.outdir);

                    // Non-promises/undefined instantly resolve
                    return Promise.resolve(workerResult)
                        .then(function(workerResult) {
                            metrics.processingInSeconds = parseFloat(timer_elapsed_seconds(timers.processing));
                            context.workerResult = workerResult;
                            return Promise.resolve(context);
                        })
                        .catch((e) => {
                            // This is where we will catch the errors that happen inside the workers. We need to figure
                            // out if we will throw the specific error types in workers or not. Library needs to know
                            // what kind of error it was to pass along as `errorReason` for events/metrics
                            if (e.reason in Reason || e instanceof GenericError) {
                                return Promise.reject(e);
                            }
                            return Promise.reject(new GenericError(e.message || e, `${proc.env.__OW_ACTION_NAME.split('/').pop()}_processing`));
                        });

                } catch (e) {
                    return Promise.reject(e);
                }

                // --------------------------------------------------------

            }).then(function (context) {
                console.log("workerResult", context.workerResult);

                // 4. collect generated files
                context.renditions = {};
                let count = 0;
                const files = fs.readdirSync(context.outdir);
                files.forEach(f => {
                    const file = path.join(context.outdir, f);
                    const stat = fs.statSync(file)
                    if (stat.isFile()) {
                        console.log("- rendition found:", f);
                        context.renditions[f] = {
                        };
                        context.renditions[f]['repo:size'] = stat.size;
                        try {
                            const dimensions = sizeOf(file);
                            context.renditions[f]['tiff:imageWidth'] = dimensions.width;
                            context.renditions[f]['tiff:imageHeight'] = dimensions.height;
                        } catch (err) {
                            // The rendition may or may not be an image, so log error for informational purposes
                            console.log(`No dimensions found for file ${f}`, err.message || err);
                        }
                        count += 1;
                    }
                });

                // Strange situation where worker didn't fail and yet there are no renditions
                if (count === 0) {
                    reject(new GenericError("No generated renditions found.", "worker_result"))
                }

                return context;

            }).then(function(context) {
                // 5. upload generated renditions (entire outdir)

                timers.upload = timer_start();

                let upload;

                // add other target storage types here
                // if (target.ftp) {
                //     upload = new Promise(function (resolve, reject) {
                //     });
                // } else if (target.azure) {
                //     upload = new Promise(function (resolve, reject) {
                //     });
                // } else {
                // }

                if (context.isLocalFile) {
                    upload = local.upload(params, context);

                } else {
                    // TODO: Enable multipart after its tested
                    // check to see if the upload is multipart
                    // if (params.renditions &&
                    //     params.renditions.length &&
                    //     params.renditions[0].target &&
                    //     params.renditions[0].target.type === 'http-multipart') {
                    //   upload = httpMultipart.upload(params, context);
                    // } else {
                      // PUT http url in renditions
                      upload = http.upload(params, context);
                    // }
                }
                return upload;

            }).then(function(context) {
                console.log(JSON.stringify(context));
                try {
                    metrics.uploadInSeconds = parseFloat(timer_elapsed_seconds(timers.upload));
                } catch(e) {
                    console.error("error getting timing metrics:", e.message || e);
                }
                console.log("download of source file took", metrics.downloadInSeconds, "seconds");
                console.log("processing of all renditions took", metrics.processingInSeconds, "seconds");
                console.log("uploading of all renditions took",metrics.uploadInSeconds, "seconds");

                // TODO: bug from http.js returning a Promise.all() array of context
                if (Array.isArray(context)) {
                    context = context[0];
                }

                // send events
                let chain = Promise.resolve();
                if (Array.isArray(params.renditions)) {
                    const events = getEventHandler(params);
                    chain = Promise.all(params.renditions.map(rendition => {
                        // check if successfully created
                        metrics.duration =  parseFloat(timer_elapsed_seconds(timers.duration));
                        if (context.renditions[rendition.name]) {
                            return events.sendEvent("rendition_created", { rendition: rendition, metadata: context.renditions[rendition.name] }).then(() => {
                                return sendNewRelicMetrics(params,
                                    Object.assign( metrics || {} , { eventType: "rendition"}, rendition));
                            })
                        } else {
                            // TODO: add error details - requires some refactoring
                            // - file too large for multipart upload, include actual rendition size
                            // - mime type wrong
                            return events.sendErrorEvent("rendition_failed", {
                                rendition: rendition,
                                errorReason:Reason.GenericError,
                                errorMessage:`No rendition found for ${rendition.name}`
                                }, Object.assign( metrics || {} , {
                                    eventType: "error",
                                    reason:Reason.GenericError,
                                    message:`No rendition found for ${rendition.name}`,
                                    location:"uploading_error"
                                })
                            )
                        }
                    }));
                }

                chain.then(() => {
                    cleanup(null, context, timeoutId);
                    
                    delete params.newRelicApiKey; 
                    return resolve({
                        ok: true,
                        renditions: context.renditions,
                        workerResult: context.workerResult,
                        params: params,
                        metrics: metrics
                    });
                })
                .catch(error => {
                    return reject(error);
                });

            }).catch(function (error) {
                const events = getEventHandler(params);
                params.renditions.forEach(rendition => events.sendErrorEvent("rendition_failed", { 
                    rendition,
                    errorReason:error.reason || Reason.GenericError,
                    errorMessage: error.message || error
                    }, Object.assign( metrics || {} , {
                        eventType: "error",
                        reason: error.reason || Reason.GenericError,
                        message: error.message || error,
                        location: error.location || "library_processing_error"   
                    })
                ));
                cleanup(error, context, timeoutId);
                return reject(error);    
            });
        } catch (e) {
        // overall try catch statement to catch unknown library errors
            const events = getEventHandler(params);
            params.renditions.forEach(rendition => events.sendErrorEvent("rendition_failed", { 
                rendition,
                errorReason:e.name || Reason.GenericError,
                errorMessage: e.message || e
                }, Object.assign( metrics || {} , {
                    eventType: "error",
                    reason: e.reason || Reason.GenericError,
                    message: e.message || e,
                    location: e.location || "library_unexpected_error"
                })
            ));
            cleanup(e, context, timeoutId);
            return reject(`unexpected error in worker library: ${e}`);     
        }
    });
}

// -----------------------< helper for workers that do one rendition at a time >-----------------------------------

function forEachRendition(params, options, renditionFn) {
    if (typeof options === "function") {
        renditionFn = options;
        options = {};
    }
    
    return process(params, options, function(infile, params, outdir) {

        let promise = Promise.resolve();

        const renditionResults = [];

        if (Array.isArray(params.renditions)) {
            // for each rendition to generate, create a promise that calls the actual rendition function passed
            const renditionPromiseFns = params.renditions.map(function (rendition) {

                // default rendition filename if not specified
                if (rendition.name === undefined) {
                    const size = `${rendition.wid}x${rendition.hei}`;
                    if (validUrl.isUri(infile)) {
                        rendition.name = `${path.basename(url.parse(infile).pathname)}.${size}.${rendition.fmt}`;
                    } else {
                        rendition.name = `${path.basename(infile)}.${size}.${rendition.fmt}`;
                    }
                }

                // for sequential execution below it's critical to not start the promise executor yet,
                // so we collect functions that return promises
                return function() {
                    return new Promise(function (resolve, reject) {
                        try {
                            const result = renditionFn(infile, rendition, outdir, params);

                            // Non-promises/undefined instantly resolve
                            return Promise.resolve(result)
                                .then(function(result) {
                                    renditionResults.push(result);
                                    return resolve();
                                })
                                // TODO: do not abort processing of remaining renditions?
                                .catch((e) => reject(e));

                        } catch (e) {
                            return reject(e.message);
                        }
                    });
                };
            });

            if (options.parallel) {
                // parallel execution
                promise = Promise.all(renditionPromiseFns.map(function(promiseFn) {
                    return promiseFn();
                }));
            } else {
                // sequential execution
                for (let i=0; i < renditionPromiseFns.length; i++) {
                    promise = promise.then(renditionPromiseFns[i]);
                }
            }
        }

        return promise.then(function() {
            return { renditions: renditionResults };
        });
    });
}

// -----------------------< shell script support >-----------------------------------

// TODO: #6 ensure everything passed to the shell script is shell escaped, so that an attacker
//       cannot do tricks like `param: "; curl -X <copy proprietary libraries from image to the internet>"`
//       which then might get executed by the shell inside the container

// TODO: support shell script worker with all renditions at once
//       passing array of $rendition, e.g.
//
//          `convert-app $file $rendition[0] $rendition[1] $rendition[2]`
//
//       question would be how one can easily loop this in a shell script, including rendition_fmt arguments
//       Note that the whole point of the shell script worker is that it is super simple
//       for developers and the command is easily readable (as compared to very hidden
//       inside some strings in js code for example).

function shellScript(params, shellScriptName = "worker.sh") {
    console.log("START of worker processing for ingestionId", params.ingestionId);
    return forEachRendition(params, function(infile, rendition, outdir) {
        return new Promise(function (resolve, reject) {
            console.log("executing shell script", shellScriptName, "for rendition", rendition.name);
            
            // inherit environment variables
            const env = Object.create(proc.env || {});

            env.file = path.resolve(infile);
            env.rendition = path.resolve(outdir, rendition.name);
            const errDir = path.resolve(outdir, "errors");
            fs.mkdirsSync(errDir);
            const errorFile = path.resolve(errDir, "error.json");
            env.errorfile = errorFile;
            
            for (const r in rendition) {
                const value = rendition[r];
                if (typeof value === 'object') {
                    for (const r2 in value) {
                        // TODO: unlimited object nesting support, not just 1 level
                        env[`rendition_${r}_${r2}`] = value[r2];
                    }
                } else {
                    env[`rendition_${r}`] = value;
                }
            }
            const shellScript = path.resolve(__dirname, shellScriptName);

            if (!fs.existsSync(shellScript)) {
                console.log("FAILURE of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
                return reject(`shell script '${shellScriptName}' not found`);
            }

            // ensure script is executable
            execSync(`chmod u+x ${shellScript}`, {stdio: [0,1,2]});

            const options = {
                env: env,
                stdio: [0,1,2]
            };

            exec(`/usr/bin/env bash -x ${shellScript}`, options, function (error, stdout, stderr) {
                // I/O Runtime's log handling (reading logs from Splunk) currently does not like longer multi-line logs
                // so we log each line individually
                stdout.trim().split('\n').forEach(s => console.log(s))
                stderr.trim().split('\n').forEach(s => console.error(s))
                if (error) {
                    console.log("FAILURE of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
                    // We try to get error information from the errorfile, but ensure that we still do proper
                    // error reporting even if the data is badly formed
                    if (fs.existsSync(errorFile)) {
                        const json = fs.readFileSync(errorFile);
                        fs.removeSync(errorFile);
                        try {
                            const err = JSON.parse(json);
                            return reject(err);
                        } catch (e) {
                            console.log(`Badly formed json for error: ${json}`);
                        }
                    }
                    return reject(error);
                } else {
                    console.log("END of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
                    return resolve(rendition.name);
                }
            });
        });
    });
}

function shellScriptWorker(shellScriptName) {
    return function(params) {
        return shellScript(params, shellScriptName);
    }
}

// -----------------------< exports >-----------------------------------

module.exports = {
    filename,
    process,
    forEachRendition,
    shellScriptWorker,
    getEventHandler,
    sendNewRelicMetrics
}
