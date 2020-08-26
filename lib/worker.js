/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

const { AssetComputeMetrics, AssetComputeEvents, GenericError, Reason, OpenwhiskActionName } = require('@adobe/asset-compute-commons');
const process = require('process');
const path = require('path');

const { createDirectories, cleanupDirectories } = require('./prepare');
const { getSource, putRendition } = require('./storage');
const Rendition = require('./rendition');

const imagePostProcess = require('./postprocessing/image');
const { validateParameters } = require('./validate');
const Timer = require('./utils/timer');
const { Sampler } = require('@adobe/metrics-sampler');
const { metrics: cgroupMetrics, cpu } = require('@adobe/cgroup-metrics');

const CLEANUP_FAILED_EXIT_CODE = 100;
const TIMEOUT_EXIT_CODE = 101;

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";

const METRIC_RENDITION = "rendition";
const DEFAULT_METRIC_TIMEOUT_MS = 60000; // default openwhisk action timeout
const TIMEOUT_BUFFER = 15000; // time before an action timeout when to send timeout metrics

function durationSec(start, end) {
    if (start === undefined || end === undefined) {
        return undefined;
    }
    if (!(start instanceof Date)) {
        start = new Date(start);
    }
    if (!(end instanceof Date)) {
        end = new Date(end);
    }
    return (end - start) / 1000;
}

// use same timeout logic as `@adobe/node-openwhisk-newrelic`: https://github.com/adobe/node-openwhisk-newrelic/blob/master/lib/metrics.js#L38-L44
function timeUntilTimeout() {
    return (process.env.__OW_DEADLINE - Date.now()) || DEFAULT_METRIC_TIMEOUT_MS;
}

class AssetComputeWorker {

    /**
     * Construct Asset Compute Worker
     *
     * @param {*} params Worker parameters
     * @param {Boolean} [options.disableSourceDownload=false] Disable source download
     * @param {Boolean} [options.disableRenditionUpload=false] Disable rendition upload
     */
    constructor(params, options = {}) {
        this.workerStartTime = new Date();

        this.params = params;
        this.options = options;

        validateParameters(this.params);

        this.events = new AssetComputeEvents(this.params);
        this.metrics = params.metrics || new AssetComputeMetrics(params);

        // set timeout to send events before action timeout
        if (!process.env.DISABLE_IO_EVENTS_ON_TIMEOUT) {
            this.actionTimeoutId = this.sendEventsBeforeActionTimeout();
        }

        this.renditionErrors = [];

        this.actionName = new OpenwhiskActionName().name;

        this.params.times = this.params.times || {};
        this.processingStartTime = this.params.times.gateway ?
            new Date(this.params.times.gateway) :
            new Date(this.params.times.process);

        this.metrics.add({
            startWorkerDuration: durationSec(this.processingStartTime, this.workerStartTime),
            gatewayToProcessDuration: durationSec(this.params.times.gateway, this.params.times.process),
            processToCoreDuration: durationSec(this.params.times.process, this.params.times.core)
        });

        this.timers = {
            actionDuration: new Timer(),
            download: 0,
            processing: 0,
            postProcessing: 0,
            callbackProcessing: 0,
            upload: 0,
            currentProcessing: 0,
            currentPostProcessing: 0,
            currentUpload: 0
        };
    }

    async compute(renditionCallback) {
        return this.run(async () => {
            for (const rendition of this.renditions) {
                await this.processRendition(rendition, renditionCallback);
            }
        });
    }

    async computeAllAtOnce(renditionsCallback) {
        return this.run(async () => {
            await this.batchProcessRenditions(renditionsCallback);
        });
    }

    // -----------------------< private >-----------------------------------

    // main logic and error & result handling
    async run(processCallback) {
        try {
            await this.prepare();

            await processCallback();

        } catch (err) {
            await this.metrics.handleError(err);
            throw this.getResult(err);

        } finally {
            await this.cleanup();
        }

        return this.getResult();
    }

    async prepare() {
        // Note: any failure to prepare should throw and fail this function

        console.log(`worker ${this.actionName} ${this.params.requestId}`);
        if (!process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS) {
            this.cgroupSampler = new Sampler(() => {
                const metrics_object = cgroupMetrics();

                const curr_cpu_usage = metrics_object.cpuacct.usage;
                delete metrics_object.cpuacct.usage;
                delete metrics_object.cpuacct.stat;
                if (this.previousCpuUsage) {
                    metrics_object.cpuacct.usagePercentage = cpu.calculateUsage(this.previousCpuUsage, curr_cpu_usage);
                } else {
                    metrics_object.cpuacct.usagePercentage = undefined;
                }
                this.previousCpuUsage = curr_cpu_usage;
                return metrics_object;
            });

            this.cgroupSampler.start();
        }

        this.directories = await createDirectories();

        this.renditions = Rendition.forEach(this.params.renditions, this.directories.out);

        this.timers.download = new Timer();

        if (this.params.source !== undefined && this.params.source !== null) {
            this.source = await getSource(
                this.params.source,
                this.directories.in,
                this.options.disableSourceDownload
            );
        }

        this.timers.download.end();
        console.log(`source downloaded in ${this.timers.download.durationSec()} seconds`);
    }

    async processRendition(rendition, renditionCallback) {
        this.timers.currentCallbackProcessing = new Timer();
        const callbackTimer = this.timers.currentCallbackProcessing;

        try {
            console.log(`generating rendition ${rendition.id()} (${rendition.name})...`);
            console.log(rendition.instructionsForEvent());

            // call client-provided callback to transform source into 1 rendition
            await renditionCallback(this.source, rendition, this.params);

            callbackTimer.duration();

            // check if rendition was created
            if (!this.options.disableRenditionUpload && !rendition.exists()) {
                console.error(`no rendition found after worker() callback processing at: ${rendition.path}`);
                throw new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_process_norendition`);
            }

        } catch (err) {
            console.error(`worker() callback processing failed with error after ${callbackTimer.durationSec()} seconds: ${err.message || err}`);
            await this.renditionFailure(rendition, err);
            // continue with next rendition
            return;
        }

        // check and log resulting rendition
        this.timers.callbackProcessing += callbackTimer.end();
        console.log(`worker() callback generated rendition in ${callbackTimer.durationSec()} seconds: ${rendition.name}`);

        rendition = await this.postProcess(rendition);
        if (!rendition) {
            return;
        }

        if (this.options.disableRenditionUpload) {
            await this.renditionSuccess(rendition);
        } else {
            await this.upload(rendition);
        }
    }

    async batchProcessRenditions(renditionsCallback) {
        const callbackTimer = this.timers.currentCallbackProcessing = new Timer();

        // rendition callback execution
        try {
            console.log(`generating all ${this.renditions.length} renditions...`);
            for (const rendition of this.renditions) {
                console.log(rendition.instructionsForEvent());
            }

            // call client-provided callback to transform source into 1 rendition
            await renditionsCallback(this.source, this.renditions, this.directories.out, this.params);

            this.timers.callbackProcessing = callbackTimer.end();
            console.log(`processing finished successfully after ${callbackTimer.durationSec()} seconds`);

        } catch (err) {
            console.error(`processing failed with error after ${callbackTimer.durationSec()} seconds: ${err.message || err}`);
            // just send 1 metric, but individual IO events per rendition
            await this.metrics.handleError(err, {
                location: `${this.actionName}_batchProcess`,
                metrics: {
                    processingDuration: callbackTimer.duration(),
                }
            });
            // we cannot check if some renditions were properly generated or not,
            // so we have to assume everything failed
            for (const rendition of this.renditions) {
                await this.renditionFailure(rendition, err, true);
            }
            return;
        }

        // post process and upload
        for (let rendition of this.renditions) {

            rendition = await this.postProcess(rendition);
            if (!rendition) {
                continue;
            }

            if (this.options.disableRenditionUpload) {
                await this.renditionSuccess(rendition);
            } else if (rendition.exists()) {
                await this.upload(rendition);
            } else {
                console.error(`no rendition found at: ${rendition.path}`);
                await this.renditionFailure(rendition, new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_batchProcess_norendition`));
            }
        }
    }

    async postProcess(rendition) {
        // start post-processing timer
        const postProcessingTimer = this.timers.currentPostProcessing = new Timer();

        if (this.shouldPostProcess(rendition)) {

            try {
                // at this point, we have the rendition a worker created, available at rendition.path
                // naming rules are rendition0.extension, rendition1.extension, etc.
                // put postprocessed rendition in a new file
                const newRendition = new Rendition(rendition.instructions, rendition.directory, rendition.index, `post-${rendition.name}`);

                console.log(`post-processing image rendition ${rendition.name} => ${newRendition.name}`);

                await imagePostProcess(rendition.path, newRendition.path, rendition.instructions);

                this.timers.postProcessing += postProcessingTimer.duration();
                console.log(`post-processing ${rendition.name} finished successfully in ${postProcessingTimer.durationSec()} seconds`);

                // point to proper rendition once postprocessing done
                this.renditions[rendition.index] = newRendition;
                rendition = newRendition;

            } catch (err) {
                // if postprocessing fails, rendition will be failed too
                this.timers.postProcessing += postProcessingTimer.duration();
                console.error(`post-processing ${rendition.name} failed after ${postProcessingTimer.durationSec()}: ${err.message || err}`);
                await this.renditionFailure(rendition, err);
                return undefined;

            }
        } else {
            this.timers.postProcessing += postProcessingTimer.duration();
        }

        return rendition;
    }

    shouldPostProcess(rendition) {
        if (!rendition.postProcess) {
            return false;
        }

        // verify if the requested format is one we can output from post-processing
        if (!["png", "jpg", "jpeg", "gif", "tif", "tiff"].includes(rendition.instructions.fmt)) {
            console.log(`Skipping post-processing because fmt ${rendition.instructions.fmt} is not supported`);
            return false;
        }

        // using rendition.name because it's build using the original rendition name and so we have the extension
        const renditionExtension = path.extname(rendition.name).substring(1).toLowerCase();
        if (!renditionExtension || !["png", "jpg", "jpeg", "gif", "tif", "tiff", "bmp"].includes(renditionExtension)) {
            console.log(`Skipping post-processing because rendition type ${renditionExtension} is not supported`);
            return false;
        }

        // needs to have a rendition in order to post-process something...
        return rendition.exists();
    }

    async upload(rendition) {
        try {
            this.timers.currentUpload = new Timer();

            await putRendition(rendition);

            this.timers.upload += this.timers.currentUpload.end();

            await this.renditionSuccess(rendition);

        } catch (err) {
            // if upload fails, send errors and continue with next rendition
            await this.renditionFailure(rendition, err);
        }
    }

    async renditionSuccess(rendition) {
        if (rendition.eventSent) {
            return;
        }

        const renditionDoneTime = new Date();

        const instructions = rendition.instructionsForEvent();

        await this.events.sendEvent(EVENT_RENDITION_CREATED, {
            rendition: instructions,
            metadata: await rendition.metadata(),
            activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined,
            data: rendition.shouldEmbedInIOEvent() ? (await rendition.asDataUri()) : undefined
        });

        rendition.eventSent = true;

        await this.metrics.sendMetrics(METRIC_RENDITION, {
            // rendition instructions
            ...instructions,
            renditionName: instructions.name,
            renditionFormat: instructions.fmt,
            // durations
            downloadDuration: this.timers.download.duration(),
            callbackProcessingDuration: this.timers.currentCallbackProcessing.duration(),
            postProcessingDuration: this.timers.currentPostProcessing ? this.timers.currentPostProcessing.duration() : 0,
            processingDuration: this.timers.currentCallbackProcessing.duration()
                + (this.timers.currentPostProcessing ? this.timers.currentPostProcessing.duration() : 0),
            uploadDuration: this.timers.currentUpload && this.timers.currentUpload.duration(),
            renditionDuration: durationSec(this.processingStartTime, renditionDoneTime),
            // rendition metadata
            size: rendition.size()
        });
    }

    async renditionFailure(rendition, err, skipMetrics) {
        this.renditionErrors.push(err);

        if (rendition.eventSent) {
            return;
        }

        const renditionDoneTime = new Date();

        const instructions = rendition.instructionsForEvent();

        // one IO Event per failed rendition
        await this.events.sendEvent(EVENT_RENDITION_FAILED, {
            rendition: instructions,
            errorReason: (err && err.reason) || Reason.GenericError,
            errorMessage: err ? (err.message || err) : undefined,
            activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
        });

        rendition.eventSent = true;

        if (!skipMetrics) {
            // one metric per failed rendition
            await this.metrics.handleError(err, {
                location: `${this.actionName}_process`,
                metrics: {
                    // rendition instructions
                    ...instructions,
                    renditionName: instructions.name,
                    renditionFormat: instructions.fmt,
                    // durations
                    callbackProcessingDuration: this.timers.currentCallbackProcessing.duration(),
                    postProcessingDuration: this.timers.currentPostProcessing ? this.timers.currentPostProcessing.duration() : 0,
                    processingDuration: this.timers.currentCallbackProcessing.duration()
                        + (this.timers.currentPostProcessing ? this.timers.currentPostProcessing.duration() : 0),
                    renditionDuration: durationSec(this.processingStartTime, renditionDoneTime)
                }
            });
        }
    }

    sendEventsBeforeActionTimeout() {
        return setTimeout(
            async () => {
                console.log(`Action is about to timeout in ${timeUntilTimeout()}ms. Sending rendition_failed events before timeout.`);
                const errorMessage = `Worker timed out without result after ${this.timers.actionDuration.end()} seconds.`;
                // ensure failure events are sent for any non successful rendition before timeout
                if (this.renditions) {
                    for (const rendition of this.renditions) {
                        if (!rendition.eventSent) {
                            rendition.eventSent = true;
                            await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                                rendition: rendition.instructionsForEvent(),
                                errorReason: Reason.GenericError,
                                errorMessage: errorMessage,
                                activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
                            });
                        }
                    }
                } else {
                    // if no `this.renditions`, it means action is timing out before `this.renditions` is defined in `prepare()`
                    // send rendition_failed event by default in this case
                    if (this.params && this.params.renditions) {
                        for (const rendition of this.params.renditions) {
                            // remove target URLs, could be sensitive
                            const renditionCopy = { ...rendition };
                            delete renditionCopy.target;
                            await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                                rendition: renditionCopy,
                                errorReason: Reason.GenericError,
                                errorMessage: errorMessage,
                                activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
                            });
                        }
                    }
                }
                // clear action timeout to avoid sending concurrent `timeout` metrics
                // hack to use the actual newRelic class to clear action timeout
                clearTimeout(this.metrics && this.metrics.newRelic && this.metrics.newRelic.actionTimeoutId);
                // send timeout metric immediately to New Relic
                await this.metrics.sendMetrics('timeout', {
                    duration: this.timers.actionDuration.end()
                }, true);

                // Abort processsing. Process ended abnormally by timeout
                process.exit(TIMEOUT_EXIT_CODE);
            },
            timeUntilTimeout() - TIMEOUT_BUFFER
        );
    }

    async cleanup() {
        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run
        const cleanupSuccess = await cleanupDirectories(this.directories);

        clearTimeout(this.actionTimeoutId);

        this.timers.actionDuration.end();

        // extra protection: ensure failure events are sent for any non successful rendition
        if (this.renditions) {
            for (const rendition of this.renditions) {
                if (!rendition.eventSent) {
                    await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                        rendition: rendition.instructionsForEvent(),
                        errorReason: Reason.GenericError,
                        errorMessage: "Unknown error",
                        activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
                    });
                    rendition.eventSent = true;
                }
            }
        }

        const cgroupMetrics = {};
        if (this.cgroupSampler) {
            const cgroup = await this.cgroupSampler.finish();
            Object.keys(cgroup).forEach(key => {
                if (key) {
                    cgroupMetrics[key.replace('cpuacct', "cpu")] = cgroup[key];
                }
            });
        }

        // add final metrics (for activation metric)
        this.metrics.add({
            ...cgroupMetrics || {},
            duration: this.timers.actionDuration ? this.timers.actionDuration.duration() : undefined,
            downloadDuration: this.timers.download ? this.timers.download.duration() : undefined,
            callbackProcessingDuration: this.timers.callbackProcessing,
            postProcessingDuration: this.timers.postProcessing,
            processingDuration: this.timers.callbackProcessing + this.timers.postProcessing,
            uploadDuration: this.timers.upload
        });

        // if data clean up fails (leftover directories),
        // we kill the container to avoid data leak
        if (!cleanupSuccess && !process.env.WORKER_TEST_MODE) {
            // might want to avoid exit when unit testing...
            console.log("Cleanup was not successful, killing container to prevent further use for action invocations");
            process.exit(CLEANUP_FAILED_EXIT_CODE);
        }
    }

    getResult(err) {
        // make sure to not return urls, customer data or credentials

        const result = {
            requestId: this.params.requestId,
            metrics: this.activationMetrics
        };

        const source = this.params.source;
        if (source) {
            result.source = {
                name: source.name,
                mimetype: source.mimetype,
                size: source.size
            };
        }

        if (this.renditions) {
            result.renditions = [];
            for (const rendition of this.renditions) {
                result.renditions.push(rendition.instructionsForEvent());
            }
        }

        if (this.renditionErrors.length > 0) {
            result.renditionErrors = this.renditionErrors;
        }

        if (err) {
            return Object.assign(err, result);
        } else {
            return result;
        }
    }
}

// -----------------------< exports >-----------------------------------
module.exports = AssetComputeWorker;
