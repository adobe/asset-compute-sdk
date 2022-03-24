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

const { AssetComputeMetrics, AssetComputeEvents, ClientError, GenericError, Reason, OpenwhiskActionName, AssetComputeLogUtils } = require('@adobe/asset-compute-commons');
const process = require('process');
const { Utils, Rendition, Prepare, Storage, Timer } = require('@adobe/asset-compute-pipeline');

const { prepareImagePostProcess, needsImagePostProcess, imagePostProcess } = require('./postprocessing/image');
const { validateParameters } = require('./validate');
const { Sampler } = require('@adobe/metrics-sampler');
const { metrics: cgroupMetrics, cpu } = require('@adobe/cgroup-metrics');
const fse = require('fs-extra');

const CLEANUP_FAILED_EXIT_CODE = 100;
const TIMEOUT_EXIT_CODE = 101;

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";

const METRIC_RENDITION = "rendition";
const TIMEOUT_BUFFER = 15000; // time before an action timeout when to send timeout metrics

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

        
        if (this.params.predictedRunDuration) {
            console.log('Predicted run duration for the activation', this.params.predictedRunDuration);
            // TODO: add this in asset-compute commons so it is in both pipeline and non pipeline requests
        }

        this.metrics.add({
            startWorkerDuration: Utils.durationSec(this.processingStartTime, this.workerStartTime),
            gatewayToProcessDuration: Utils.durationSec(this.params.times.gateway, this.params.times.process),
            processToCoreDuration: Utils.durationSec(this.params.times.process, this.params.times.core),
            renditionCount: this.params.renditions && this.params.renditions.length,
            predictedRunDuration: this.params.predictedRunDuration
        });

        this.timers = {
            actionDuration:     new Timer().start(),
            download:           new Timer(),
            processingCallback: new Timer(),
            postProcessing:     new Timer(),
            upload:             new Timer()
        };
        this.totalRenditionsSize = 0;
    }

    async compute(renditionCallback) {
        return this.run(async () => {
            for (const rendition of this.renditions) {
                try {
                    Utils.setConsoleLogPrefix(`[rendition ${rendition.index}]`);
                    await this.processRendition(rendition, renditionCallback);

                } finally {
                    Utils.setConsoleLogPrefix();
                }
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

        const folderName = "";
        const baseDirectory = "";
        const usePipeline = false;
        this.directories = await Prepare.createDirectories(folderName, baseDirectory, usePipeline);

        this.renditions = Rendition.forEach(this.params.renditions, this.directories.out, usePipeline);

        this.timers.download.start();

        if (this.params.source !== undefined && this.params.source !== null) {
            this.source = await Storage.getSource(
                this.params.source,
                this.directories.in,
                this.options.disableSourceDownload
            );
        }

        this.timers.download.stop();
        console.log(`source downloaded in ${this.timers.download} seconds`);
    }

    async processRendition(rendition, renditionCallback) {
        try {
            await this.preparePostProcess(rendition);

            console.log(`generating ${rendition.name}`);
            AssetComputeLogUtils.log(Rendition.redactInstructions(rendition.instructions), "instructions for 'worker()' callback:");

            this.timers.processingCallback.start();

            // call client-provided callback to transform source into 1 rendition
            await renditionCallback(this.source, rendition, this.params);

            this.timers.processingCallback.stop();

            // check if rendition was created
            if (!this.options.disableRenditionUpload && !rendition.exists()) {
                console.log(`no rendition found after worker() callback processing at: ${rendition.path}`);
                throw new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_process_norendition`);
            }

        } catch (err) {
            this.timers.processingCallback.stop();
            console.log(`worker() callback processing failed with error after ${this.timers.processingCallback} seconds: ${err.message || err}`);

            await this.renditionFailure(rendition, err);

            // continue with next rendition
            return;
        }

        // check and log resulting rendition
        console.log(`worker() callback generated rendition in ${this.timers.processingCallback} seconds: ${rendition.name}`);

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
        // rendition callback execution
        try {
            console.log(`generating all ${this.renditions.length} renditions...`);
            for (const rendition of this.renditions) {
                try {
                    Utils.setConsoleLogPrefix(`[rendition ${rendition.index}]`);

                    await this.preparePostProcess(rendition);

                    AssetComputeLogUtils.log(Rendition.redactInstructions(rendition.instructions), "instructions for 'batchWorker()' callback:");
                } finally {
                    Utils.setConsoleLogPrefix();
                }
            }

            this.timers.processingCallback.start();

            // call client-provided callback to transform source into 1 rendition
            await renditionsCallback(this.source, this.renditions, this.directories.out, this.params);

            this.timers.processingCallback.stop();
            console.log(`processing finished successfully after ${this.timers.processingCallback} seconds`);

        } catch (err) {
            this.timers.processingCallback.stop();
            console.log(`processing failed with error after ${this.timers.processingCallback} seconds: ${err.message || err}`);

            // just send 1 metric...
            await this.metrics.handleError(err, {
                location: `${this.actionName}_batchProcess`,
                metrics: {
                    processingDuration: this.timers.processingCallback.currentDuration(),
                }
            });

            // ...but individual IO events per rendition
            // we cannot check if some renditions were properly generated or not,
            // so we have to assume everything failed
            for (const rendition of this.renditions) {
                await this.renditionFailure(rendition, err, true);
            }
            return;
        }

        // post-process and upload
        for (let rendition of this.renditions) {
            try {
                Utils.setConsoleLogPrefix(`[rendition ${rendition.index}]`);

                rendition = await this.postProcess(rendition);
                if (!rendition) {
                    continue;
                }

                if (this.options.disableRenditionUpload) {
                    await this.renditionSuccess(rendition);
                } else if (rendition.exists()) {
                    await this.upload(rendition);
                } else {
                    console.log(`no rendition found at: ${rendition.path}`);
                    await this.renditionFailure(rendition, new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_batchProcess_norendition`));
                }
            } finally {
                Utils.setConsoleLogPrefix();
            }
        }
    }

    async preparePostProcess(rendition) {
        // post processing could ask for different instructions for the worker callback
        const intermediateInstructions = await prepareImagePostProcess(rendition, this.options);
        if (intermediateInstructions) {
            console.log("original instructions:", rendition.instructionsForEvent());

            rendition.changeInstructions(intermediateInstructions);
        }
    }

    async shouldPostProcess(rendition) {
        if (!rendition.postProcess) {
            return false;
        }

        // needs to have a rendition in order to post-process something...
        if (!rendition.exists()) {
            return false;
        }

        return needsImagePostProcess(rendition, this.source);
    }

    async postProcess(rendition) {
        this.timers.postProcessing.start();

        try {
            if (await this.shouldPostProcess(rendition)) {
                this.metrics.add({ imagePostProcess: true });

                // at this point, we have the rendition a worker created, available at rendition.path
                // naming rules are rendition0.extension, rendition1.extension, etc.
                // put postprocessed rendition in a new file inside the post/ directory
                const usePipeline = false;
                const newRendition = new Rendition(
                    rendition.originalInstructions,
                    this.directories.postprocessing,
                    rendition.index,
                    usePipeline
                );

                console.log(`post-processing image rendition ${rendition.name} => post/${newRendition.name}`);

                await imagePostProcess(rendition, newRendition, this.directories);

                this.timers.postProcessing.stop();
                console.log(`post-processing ${rendition.name} finished successfully in ${this.timers.postProcessing} seconds`);

                if (process.env.WORKER_TEST_MODE) {
                    // test-worker finds renditions using a rendition* glob by default, so we must ensure there is only one left
                    await fse.remove(rendition.path);
                }

                // point to proper rendition once postprocessing done
                this.renditions[rendition.index] = newRendition;
                rendition = newRendition;

            } else {
                this.timers.postProcessing.stop();
                this.metrics.add({ imagePostProcess: false });
            }

            return rendition;

        } catch (err) {
            // if postprocessing fails, rendition will be failed too
            this.timers.postProcessing.stop();
            console.log(`post-processing ${rendition.name} failed after ${this.timers.postProcessing}:`, err);

            // ensure a GenericError is thrown if no asset compute specific error is used
            if (!(err instanceof ClientError) && !(err instanceof GenericError)) {
                await this.renditionFailure(rendition, new GenericError(err.message, "sdk_post_process"));
            } else {
                await this.renditionFailure(rendition, err);
            }

            // return undefined to mark as failed
            return undefined;
        }
    }

    async upload(rendition) {
        try {
            this.timers.upload.start();

            await Storage.putRendition(rendition, this.directories);

            this.timers.upload.stop();

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

        const renditionSize = rendition.size();
        // track total rendition size to add to activation metrics
        this.totalRenditionsSize += renditionSize;

        await this.metrics.sendMetrics(METRIC_RENDITION, {
            // rendition instructions
            ...instructions,
            renditionName: instructions.name,
            renditionFormat: instructions.fmt,
            // durations
            downloadDuration: this.timers.download.totalDuration(),
            callbackProcessingDuration: this.timers.processingCallback.currentDuration(),
            postProcessingDuration: this.timers.postProcessing.currentDuration(),
            processingDuration: Timer.currentSum(this.timers.processingCallback, this.timers.postProcessing),
            uploadDuration: this.timers.upload.currentDuration(),
            renditionDuration: Utils.durationSec(this.processingStartTime, renditionDoneTime),
            // rendition metadata
            size: renditionSize
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
                    callbackProcessingDuration: this.timers.processingCallback.currentDuration(),
                    postProcessingDuration: this.timers.postProcessing.currentDuration(),
                    processingDuration: Timer.currentSum(this.timers.processingCallback, this.timers.postProcessing),
                    renditionDuration: Utils.durationSec(this.processingStartTime, renditionDoneTime)
                }
            });
        }
    }

    sendEventsBeforeActionTimeout() {
        return setTimeout(
            async () => {
                console.log(`Action is about to timeout in ${Utils.timeUntilActivationTimeout()}ms. Sending rendition_failed events before timeout.`);

                this.timers.actionDuration.stop();

                // ensure failure events are sent for any non successful rendition before timeout
                if (this.renditions) {
                    for (const rendition of this.renditions) {
                        if (!rendition.eventSent) {
                            const errorMessage = `Processing timed out for rendition fmt='${rendition.fmt}' without result after ${this.timers.actionDuration} seconds.`;
                            rendition.eventSent = true;
                            await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                                rendition: rendition.instructionsForEvent(),
                                errorReason: Reason.GenericError,
                                errorMessage: errorMessage,
                                activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined,
                                duration: this.timers.actionDuration.totalDuration()
                            });
                        }
                    }
                } else {
                    // if no `this.renditions`, it means action is timing out before `this.renditions` is defined in `prepare()`
                    // send rendition_failed event by default in this case
                    if (this.params && this.params.renditions) {
                        for (const rendition of this.params.renditions) {
                            const errorMessage = `Processing timed out for rendition fmt='${rendition.fmt}' without result after ${this.timers.actionDuration} seconds.`;
                            // remove target URLs, could be sensitive
                            const renditionCopy = { ...rendition };
                            delete renditionCopy.target;
                            await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                                rendition: renditionCopy,
                                errorReason: Reason.GenericError,
                                errorMessage: errorMessage,
                                activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined,
                                duration: this.timers.actionDuration.totalDuration()
                            });
                        }
                    }
                }
                // clear action timeout to avoid sending concurrent `timeout` metrics
                // hack to use the actual newRelic class to clear action timeout
                clearTimeout(this.metrics && this.metrics.newRelic && this.metrics.newRelic.actionTimeoutId);
                // send timeout metric immediately to New Relic
                await this.metrics.sendMetrics('timeout', {
                    duration: this.timers.actionDuration.totalDuration()
                }, true);

                // Abort processsing. Process ended abnormally by timeout
                process.exit(TIMEOUT_EXIT_CODE);
            },
            Utils.timeUntilActivationTimeout() - TIMEOUT_BUFFER
        );
    }

    async cleanup() {
        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run
        const cleanupSuccess = await Prepare.cleanupDirectories([this.directories]);

        clearTimeout(this.actionTimeoutId);

        this.timers.actionDuration.stop();

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
            duration: this.timers.actionDuration.totalDuration(),
            downloadDuration: this.timers.download.totalDuration(),
            callbackProcessingDuration: this.timers.processingCallback.totalDuration(),
            postProcessingDuration: this.timers.postProcessing.totalDuration(),
            processingDuration: Timer.totalSum(this.timers.processingCallback, this.timers.postProcessing),
            uploadDuration: this.timers.upload.totalDuration(),
            totalRenditionsSize: this.totalRenditionsSize
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
