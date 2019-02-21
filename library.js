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
const path = require('path');
const { exec, execSync } = require('child_process');
const proc = require('process');
const validUrl = require('valid-url');
const { AdobeIOEvents } = require('@nui/adobe-io-events-client');
const jsonwebtoken = require('jsonwebtoken');
var request = require('request');
const zlib = require('zlib');

// different storage access
const http = require('./src/storage/http');
const local = require('./src/storage/local');

// -----------------------< utils >-----------------------------------

const DEFAULT_SOURCE_FILE = "source.file";

function filename(source) {
    if (typeof source === 'string') {
        source = { url: source };
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
            sendEvent: function(type, payload) {
                console.log("sending event", type, "as", providerId);
                return ioEvents.sendEvent({
                    code: "asset_compute",
                    payload: Object.assign(payload || {}, {
                        type: type,
                        date: new Date().toISOString(),
                        requestId: params.requestId || params.ingestionId || proc.env.__OW_ACTIVATION_ID,
                        source: params.source.url || params.source,
                        userData: params.userData
                    })
                }).then(() => {
                    console.log("successfully sent event");
                }).catch(e => {
                    console.error("error sending event:", e);
                });
            }
        }

    } else {
        // TODO: do not log tokens
        console.error("`auth` missing or incomplete in request, cannot send events: ", params.auth);
        return {
            sendEvent: function() {
                return Promise.resolve();
            }
        }
    }
}

// -----------------------< new relic metrics >---------------------------------------

function sendNewRelicMetrics(params, metrics) {
    return new Promise(function(resolve, reject) {
        // We still want to continue the action even if there is an error in sending metrics to New Relic
        try {
            const url = params.newRelicEventsURL;
            
            metrics.actionName = proc.env.__OW_ACTION_NAME.split('/').pop();
            metrics.namespace = proc.env.__OW_NAMESPACE;
            metrics.activationId = proc.env.__OW_ACTIVATION_ID;
            
            return zlib.gzip(JSON.stringify(metrics), function (_, result) {
                request.post({
                    headers: {
                        'content-type': 'application/json',
                        'X-Insert-Key': params.newRelicApiKey,
                        'Content-Encoding': 'gzip' },
                    url:     url,
                    body:    result
                }, function(err, res, body){
                    if (err) { 
                        console.log('Error sending event to New Relic:', err); 
                    } else if (res.statusCode != 200) {
                        console.log('statusCode:', res && res.statusCode);
                    } else {
                        console.log('Event sent to New Relic', body); 
                    }
                    // promise always resolves so failure of sending metrics does not cause action to fail
                    resolve();
                });
            });
            
        } catch (error) {
            console.error('Error sending metrics to New Relic. CHeck New Relic Api Key and Account Id');
            resolve();
            
        }
    })
}

// -----------------------< core processing logic >-----------------------------------

function cleanup(err, context) {
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
        console.error(e);
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
    const metrics = {"eventType":"worker"};
    timers.duration = timer_start();
    
    // update memory metrics every 1 second
    setInterval(
        () => {
            metrics.rss = proc.memoryUsage().rss;
            metrics.heapTotal = proc.memoryUsage().heapTotal;
            metrics.heapUsed = proc.memoryUsage().heapUsed;
            metrics.external = proc.memoryUsage().external;
        }, 
        1000
    ); 

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
                reject("No 'source' in params. Required for asset workers.");
                return;
            }
            if (typeof source === 'string') {
                params.source = source = { url: source };
            }

            context.infilename = filename(source);
            context.infile = path.join(context.indir, context.infilename);

            // 1. download source file
            if (source.url) {
                if (validUrl.isUri(source.url)) {
                    console.log("START download for ingestionId", params.ingestionId, "file", context.infile);

                    // download http/https url into file
                    download = http.download(params, context);

                } else {
                    // possibly local file mounted on the docker image - for unit testing
                    download = local.download(params, context);
                }
            } else {
                return reject("source as string or source.url is required");
            }

            timers.download = timer_start();

            download.then(function(context) {
                metrics.downloadInSeconds = parseFloat(timer_elapsed_seconds(timers.download));
                
                console.log("END download for ingestionId", params.ingestionId, "file", context.infile);
                const stats = fs.statSync(context.infile);
                metrics.sourceSize = stats.size;
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
                        .then(function(workerResult) {;
                            metrics.processingInSeconds = parseFloat(timer_elapsed_seconds(timers.processing));
                            context.workerResult = workerResult;
                            return Promise.resolve(context);
                        })
                        .catch((e) => Promise.reject(e));

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
                    const stat = fs.statSync(path.join(context.outdir, f));
                    if (stat.isFile()) {
                        console.log("- rendition found:", f);
                        context.renditions[f] = {
                            size: stat.size
                        };
                        count += 1;
                    }
                });

                if (count === 0) {
                    reject("No generated renditions found.");
                }

                return context;

            }).then(function(context) {
                // 5. upload generated renditions (entire outdir)

                const target = params.target || {};

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
                    // PUT http url in renditions
                    upload = http.upload(params, context);
                }
                return upload;

            }).then(function(context) {
                try {
                    metrics.uploadInSeconds = parseFloat(timer_elapsed_seconds(timers.upload));
                } catch(e) {
                    console.error(e);
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
                        if (context.renditions[rendition.name]) {
                            return events.sendEvent("rendition_created", {
                                rendition: rendition
                            });
                        } else {
                            // TODO: add error details - requires some refactoring
                            // - file too large for multipart upload, include actual rendition size
                            // - mime type wrong
                            return events.sendEvent("rendition_failed", {
                                rendition: rendition
                            })
                        }
                    }));
                }

                chain.then(() => {
                    cleanup(null, context);
                
                    // gather metrics to send to new relic
                    metrics.totalRenditonCount = Object.keys(params.renditions).length;
                    metrics.successfulRenditionCount = Object.keys(context.renditions).length;
                    metrics.duration = parseFloat(timer_elapsed_seconds(timers.duration));
                    metrics.status = "finished";
                    
                    return sendNewRelicMetrics(params, metrics).then(() => {
                        // remove `newRelicApiKey` and `newRelicAccountID` from action result
                        delete params.newRelicApiKey; 
                        delete params.newRelicAccountID;
                        return resolve({
                            ok: true,
                            renditions: context.renditions,
                            workerResult: context.workerResult,
                            params: params,
                            metrics: metrics
                        });
                    })
            })
                .catch(error => {
                    return reject(error);
                });

            }).catch(function (error) {
                cleanup(error, context);
                return sendNewRelicMetrics(
                    params, {
                        eventType:"worker", 
                        status: "failed", 
                        error:error
                    }
                ).then(
                    () => {
                        reject(error);
                    }
                )
            });
        } catch (e) {
            cleanup(e, context);
            return sendNewRelicMetrics(
                params, {
                    eventType:"worker", 
                    status: "failed", 
                    error:e
                }
            ).then(
                () => {
                    reject(`unexpected error in worker library: ${e}`)
                }
            );
        }
    });
}

// -----------------------< helper for workers that do one rendition at a time >-----------------------------------

function forEachRendition(params, options, renditionFn) {
    if (typeof options === "function") {
        renditionFn = options;
        options = {};
    }
    return sendNewRelicMetrics(
        params, {
            eventType:"worker", 
            status: "invoked"
        }
    ).then(() => {
        return process(params, options, function(infile, params, outdir) {

            let promise = Promise.resolve();

            const renditionResults = [];

            if (Array.isArray(params.renditions)) {
                // for each rendition to generate, create a promise that calls the actual rendition function passed
                const renditionPromiseFns = params.renditions.map(function (rendition) {

                    // default rendition filename if not specified
                    if (rendition.name === undefined) {
                        const size = `${rendition.wid}x${rendition.hei}`;
                        rendition.name = `${path.basename(infile)}.${size}.${rendition.fmt}`;
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