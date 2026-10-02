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
const ON_BEFORE_TIMEOUT_MAX_MS = 10000; // max time the onBeforeTimeout hook (and timeout metrics) may take
const PENDING_SUCCESS_MAX_MS = 3000; // max time to wait for in-flight rendition_created events on timeout
// PENDING_SUCCESS_MAX_MS + ON_BEFORE_TIMEOUT_MAX_MS must stay below TIMEOUT_BUFFER

/**
 * Waits for fn() to settle, but no longer than ms. Never rejects.
 */
async function settleWithin(fn, ms, label) {
    let timer;
    try {
        await Promise.race([
            Promise.resolve().then(fn),
            new Promise(resolve => {
                timer = setTimeout(() => {
                    console.log(`${label} did not finish within ${ms}ms, continuing`);
                    resolve();
                }, ms);
            })
        ]);
    } catch (e) {
        console.log(`${label} failed:`, e);
    } finally {
        clearTimeout(timer);
    }
}

class AssetComputeWorker {

    /**
     * Construct Asset Compute Worker
     *
     * @param {*} params Worker parameters
     * @param {Boolean} [options.disableSourceDownload=false] Disable source download
     * @param {Boolean} [options.disableRenditionUpload=false] Disable rendition upload
     * @param {Boolean} [options.delegateFailureEvents=false] Do not send rendition_failed events (including on
     *  timeout and cleanup); failures are reported through `renditionOutcomes` in the result instead.
     *  Only supported for Adobe in-house workers, ignored for custom workers
     * @param {Function} [options.onBeforeTimeout] async `(err) => {}` hook awaited (max 10 seconds) before the process
     *  exits on timeout. `err` carries `requestId`, `renditionErrors` and (if delegating) `renditionOutcomes`, like `getResult()`
     */
    constructor(params, options = {}) {
        this.workerStartTime = new Date();

        this.params = params;
        this.options = options;

        validateParameters(this.params);

        if (options.delegateFailureEvents && params.customWorker) {
            console.warn("delegateFailureEvents is not supported for custom workers and will be ignored");
        }

        this.events = new AssetComputeEvents(this.params);
        this.metrics = params.metrics || new AssetComputeMetrics(params);

        // set timeout to send events before action timeout
        if (!process.env.DISABLE_IO_EVENTS_ON_TIMEOUT) {
            this.actionTimeoutId = this.sendEventsBeforeActionTimeout();
        }

        this.renditionErrors = [];
        this.renditionOutcomes = [];
        this.pendingSuccessEvents = new Set();

        this.actionName = new OpenwhiskActionName().name;

        this.params.times = this.params.times || {};
        this.processingStartTime = this.params.times.gateway ?
            new Date(this.params.times.gateway) :
            new Date(this.params.times.process);

        this.metrics.add({
            startWorkerDuration: Utils.durationSec(this.processingStartTime, this.workerStartTime),
            gatewayToProcessDuration: Utils.durationSec(this.params.times.gateway, this.params.times.process),
            processToCoreDuration: Utils.durationSec(this.params.times.process, this.params.times.core),
            renditionCount: this.params.renditions && this.params.renditions.length
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
        let failure;
        try {
            await this.prepare();

            await processCallback();

        } catch (err) {
            failure = err;
            // report the actual error for every rendition without an outcome yet (e.g. source download failed)
            this.recordRequestedRenditionsFailed(err);
            await this.metrics.handleError(err);

        } finally {
            await this.cleanup();
        }

        // after cleanup, so the result includes outcomes recorded during cleanup
        if (failure) {
            throw this.getResult(failure);
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

        // Capture any onAfterRendition finalizers registered on the original
        // rendition object before any potential swap to a post-processed one.
        // Finalizers are opaque to the SDK: an upstream caller (e.g. a worker
        // registering a C2PA manifest propagation step via @nui/c2pa-wrapper)
        // uses them to operate on the actually-uploaded file regardless of
        // whether image post-processing transformed it. Each finalizer is
        // wrapped individually so a failure cannot break the upload path.
        const finalizers = Array.isArray(rendition._postProcessFinalizers)
            ? rendition._postProcessFinalizers.slice()
            : [];

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

            // Run onAfterRendition finalizers against the final rendition,
            // whether or not SDK image post-processing actually transformed it.
            // Each finalizer is wrapped so one failure cannot break upload nor
            // prevent subsequent finalizers from running.
            for (const fn of finalizers) {
                try {
                    await fn(rendition);
                } catch (err) {
                    console.log(`onAfterRendition finalizer failed (non-fatal): ${err && err.message || err}`);
                }
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

        // tracked so the timeout handler can wait for it instead of reporting the rendition as failed
        const publication = (async () => {
            const metadata = await rendition.metadata();
            const data = rendition.shouldEmbedInIOEvent() ? (await rendition.asDataUri()) : undefined;
            // the timeout handler may have reported this rendition as failed meanwhile
            if (rendition.eventSent || this.outcomesFinalized) {
                return false;
            }
            await this.events.sendEvent(EVENT_RENDITION_CREATED, {
                rendition: instructions,
                metadata,
                activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined,
                data
            });

            rendition.eventSent = true;
            this.recordOutcome(rendition.index, "success");
            return true;
        })();
        this.pendingSuccessEvents.add(publication);
        try {
            if (!await publication) {
                return;
            }
        } finally {
            this.pendingSuccessEvents.delete(publication);
        }

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
        await this.sendFailureEvent({
            rendition: instructions,
            errorReason: (err && err.reason) || Reason.GenericError,
            errorMessage: err ? (err.message || err) : undefined
        });

        rendition.eventSent = true;
        this.recordOutcome(rendition.index, "failed", err);

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

    // only supported for Adobe in-house workers: custom workers always send rendition_failed events
    delegatesFailureEvents() {
        return !!(this.options && this.options.delegateFailureEvents) && !this.params.customWorker;
    }

    // sends a rendition_failed event, unless failure events are delegated to the caller
    async sendFailureEvent(payload) {
        if (this.delegatesFailureEvents()) {
            return;
        }
        await this.events.sendEvent(EVENT_RENDITION_FAILED, {
            ...payload,
            activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
        });
    }

    // records (or replaces) the final outcome of a rendition (by index), used for `getResult()`
    recordOutcome(index, status, err) {
        if (this.outcomesFinalized) {
            return;
        }
        const outcome = { index, status };
        if (status === "failed") {
            outcome.errorType = (err && err.reason) || Reason.GenericError;
            outcome.message = err ? (err.message || String(err)) : undefined;
        }
        const existing = this.renditionOutcomes.findIndex(o => o.index === index);
        if (existing >= 0) {
            this.renditionOutcomes[existing] = outcome;
        } else {
            this.renditionOutcomes.push(outcome);
        }
    }

    // reports a failure for every requested rendition (from params) that has no outcome yet,
    // used when the invocation fails before `this.renditions` exists
    recordRequestedRenditionsFailed(err) {
        const requested = (this.params && Array.isArray(this.params.renditions)) ? this.params.renditions : [];
        requested.forEach((_, index) => {
            if (!this.renditionOutcomes.some(o => o.index === index)) {
                this.recordOutcome(index, "failed", err);
            }
        });
    }

    sendEventsBeforeActionTimeout() {
        return setTimeout(
            async () => {
                try {
                    await this.finalizeOnTimeout();
                } catch (e) {
                    console.log("Error while handling action timeout:", e);
                } finally {
                    // Abort processsing. Process ended abnormally by timeout
                    process.exit(TIMEOUT_EXIT_CODE);
                }
            },
            Utils.timeUntilActivationTimeout() - TIMEOUT_BUFFER
        );
    }

    // every step is bounded and catches its own errors, so the process always exits before the action is killed
    async finalizeOnTimeout() {
        console.log(`Action is about to timeout in ${Utils.timeUntilActivationTimeout()}ms. Sending rendition_failed events before timeout.`);

        this.timers.actionDuration.stop();

        // let in-flight rendition_created events finish, so those renditions are reported as successful, not failed
        const pending = [...(this.pendingSuccessEvents || [])];
        if (pending.length > 0) {
            await settleWithin(() => Promise.allSettled(pending), PENDING_SUCCESS_MAX_MS, "pending rendition_created events");
        }

        // ensure failure events are sent for any non successful rendition before timeout
        const timedOut = [];
        if (this.renditions) {
            for (const rendition of this.renditions) {
                if (!rendition.eventSent) {
                    // set before any await, so a late success can no longer publish for this rendition
                    rendition.eventSent = true;
                    timedOut.push({ index: rendition.index, fmt: rendition.fmt, instructions: () => rendition.instructionsForEvent() });
                }
            }
        } else if (this.params && Array.isArray(this.params.renditions)) {
            // action is timing out before `this.renditions` is defined in `prepare()`
            for (const [index, rendition] of this.params.renditions.entries()) {
                // remove target URLs, could be sensitive
                const renditionCopy = { ...rendition };
                delete renditionCopy.target;
                timedOut.push({ index, fmt: rendition.fmt, instructions: () => renditionCopy });
            }
        }

        for (const { index, fmt, instructions } of timedOut) {
            const errorMessage = `Processing timed out for rendition fmt='${fmt}' without result after ${this.timers.actionDuration} seconds.`;
            this.recordOutcome(index, "failed", new GenericError(errorMessage, `${this.actionName}_timeout`));
            try {
                await this.sendFailureEvent({
                    rendition: instructions(),
                    errorReason: Reason.GenericError,
                    errorMessage: errorMessage,
                    duration: this.timers.actionDuration.totalDuration()
                });
            } catch (e) {
                console.log(`Failed to send rendition_failed event for rendition ${index}:`, e);
            }
        }

        // outcomes are final from here on: late results must not change what is reported to the caller
        this.outcomesFinalized = true;

        // clear action timeout to avoid sending concurrent `timeout` metrics
        // hack to use the actual newRelic class to clear action timeout
        clearTimeout(this.metrics && this.metrics.newRelic && this.metrics.newRelic.actionTimeoutId);

        // timeout metrics and the onBeforeTimeout hook run independently: telemetry must never block the hook
        await Promise.all([
            settleWithin(() => this.metrics.sendMetrics('timeout', {
                duration: this.timers.actionDuration.totalDuration()
            }, true), ON_BEFORE_TIMEOUT_MAX_MS, "timeout metrics"),
            this.runOnBeforeTimeout()
        ]);
    }

    // awaits the optional `onBeforeTimeout` hook, capped so the process can still exit before the action is killed
    async runOnBeforeTimeout() {
        if (typeof (this.options && this.options.onBeforeTimeout) !== "function") {
            return;
        }
        const err = this.getResult(new GenericError(
            `Action timed out after ${this.timers.actionDuration} seconds`, `${this.actionName}_timeout`));
        await settleWithin(() => this.options.onBeforeTimeout(err), ON_BEFORE_TIMEOUT_MAX_MS, "onBeforeTimeout hook");
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
                    await this.sendFailureEvent({
                        rendition: rendition.instructionsForEvent(),
                        errorReason: Reason.GenericError,
                        errorMessage: "Unknown error"
                    });
                    rendition.eventSent = true;
                    // keep the actual error if run() already recorded one
                    if (!this.renditionOutcomes.some(o => o.index === rendition.index)) {
                        this.recordOutcome(rendition.index, "failed", new GenericError("Unknown error", `${this.actionName}_unknown`));
                    }
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
        // reduce to requestId only

        const result = {
            requestId: this.params.requestId
        };

        if (this.renditionErrors.length > 0) {
            result.renditionErrors = this.renditionErrors;
        }

        if (this.delegatesFailureEvents()) {
            // copy, so later changes never affect a result already handed to the caller
            result.renditionOutcomes = this.renditionOutcomes.map(o => ({ ...o }));
            // the invocation as a whole failed (error or timeout): never treat the outcome list as "all succeeded"
            result.invocationFailed = !!err;
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
