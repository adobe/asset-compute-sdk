/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
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

const { AssetComputeMetrics, AssetComputeEvents, GenericError, Reason, OpenwhiskActionName } = require('@nui/asset-compute-commons');
const fse = require('fs-extra');
const process = require('process');

const {createDirectories, cleanupDirectories} = require('./prepare');
const {validateParameters} = require('./validate');
const Timer = require('./utils/timer');
const { getSource, putRendition } = require('./storage');
const Rendition = require('./rendition');

const { Sampler } = require('@nui/metrics-sampler');
const { metrics: cgroupMetrics, cpu} = require('cgroup-metrics');

const CLEANUP_FAILED_EXIT_CODE = 231;

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";

const METRIC_RENDITION = "rendition";

class AssetComputeWorker {
    constructor(params, options={}){
        this.params = params;
        this.options = options;

        validateParameters(this.params);

        this.events  = new AssetComputeEvents(this.params);
        this.metrics = new AssetComputeMetrics(this.params);
        this.renditionErrors = [];

        this.actionName = new OpenwhiskActionName().name;
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

        this.durationTimer = new Timer();
        this.timers = {
            duration: 0,
            downloadDuration: 0,
            processingDuration: 0,
            uploadDuration: 0,
            currentProcessing: 0,
            currentUpload: 0
        };

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

        this.directories = await createDirectories();

        this.renditions = Rendition.forEach(this.params.renditions, this.directories.out);

        const downloadTimer = new Timer();

        this.source = await getSource(
            this.params.source,
            this.directories.in,
            this.options.disableSourceDownload
        );

        this.timers.downloadDuration = downloadTimer.end();
        console.log(`source downloaded in ${downloadTimer.duration().toFixed(3)} seconds`);
    }

    async processRendition(rendition, renditionCallback) {
        this.timers.currentProcessing = new Timer();
        try {
            console.log(`generating rendition ${rendition.id()} (${rendition.name})...`);
            console.log(rendition.instructionsForEvent());

            // call client-provided callback to transform source into 1 rendition
            await renditionCallback(this.source, rendition);

            this.timers.currentProcessing.end();

            // check if rendition was created
            if (! await fse.exists(rendition.path)) {
                console.error(`no rendition found at: ${rendition.path}`);
                throw new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_processRendition`);
            }

        } catch (err) {
            console.error(`processing failed with error after ${this.timers.currentProcessing.duration().toFixed(3)} seconds: ${err.message || err}`);
            await this.renditionFailure(rendition, err);

            // continue with next rendition
            return;
        }

        // 2. check and log resulting rendition

        console.log(`rendition generated in ${this.timers.currentProcessing.duration().toFixed(3)} seconds: ${rendition.name}, size = ${rendition.size()}`);

        this.timers.processingDuration += this.timers.currentProcessing.duration();

        await this.upload(rendition);
    }

    async batchProcessRenditions(renditionsCallback) {
        this.timers.currentProcessing = new Timer();
        try {
            console.log(`generating all ${this.renditions.length} renditions...`);
            for (const rendition of this.renditions) {
                console.log(rendition.instructionsForEvent());
            }

            // call client-provided callback to transform source into 1 rendition
            await renditionsCallback(this.source, this.renditions, this.directories.out);

            this.timers.currentProcessing.end();
            console.log(`processing finished without error after ${this.timers.currentProcessing.duration().toFixed(3)} seconds`);

        } catch (err) {
            console.error(`processing failed with error after ${this.timers.currentProcessing.duration()} seconds: ${err.message || err}`);
            // TODO: just send 1 metric, but individual IO events per rendition
            // we cannot check if some renditions were properly generated or not,
            // so we have to assume everything failed
            for (const rendition of this.renditions) {
                await this.renditionFailure(rendition, err);
            }
            return;
        }

        for (const rendition of this.renditions) {
            // check if rendition was created
            if (await fse.exists(rendition.path)) {
                await this.upload(rendition);
            } else {
                console.error(`no rendition found at: ${rendition.path}`);
                await this.renditionFailure(rendition, new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_batchProcessRendition`));
            }
        }
    }

    async upload(rendition) {
        try {
            this.timers.currentUpload = new Timer();

            await putRendition(rendition);

            this.timers.uploadDuration += this.timers.currentUpload.end();

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

        let metadata;
        try {
            metadata = await rendition.metadata();
        } catch(e){
            console.log("Error getting metadata");
            console.log(e);
        }

        // TODO: what if sending event fails after retry? do we need to do something here?
        await this.events.sendEvent(EVENT_RENDITION_CREATED, {
            rendition: rendition.instructionsForEvent(),
            metadata: metadata
        });

        rendition.eventSent = true;

        await this.metrics.sendMetrics(METRIC_RENDITION, {
            ...rendition.instructions,
            // TODO: move timers or timer results to Rendition class
            downloadDuration: this.timers.downloadDuration,
            processingDuration: this.timers.currentProcessing.duration(),
            uploadDuration: this.timers.currentUpload.duration(),
            size: rendition.size()
        });
    }

    async renditionFailure(rendition, err) {
        this.renditionErrors.push(err);

        if (rendition.eventSent) {
            return;
        }

        // one IO Event per failed rendition
        await this.events.sendEvent(EVENT_RENDITION_FAILED, {
            rendition: rendition.instructionsForEvent(),
            errorReason: (err && err.reason) || Reason.GenericError,
            errorMessage: err ? (err.message || err) : undefined
        });

        rendition.eventSent = true;

        // one metric per failed rendition
        await this.metrics.handleError(err, {
            location: `${this.actionName}_process`,
            metrics: {
                processingDuration: this.timers.currentProcessing.duration(),
            }
        });
    }

    async cleanup() {
        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run
        const cleanupSuccess = await cleanupDirectories(this.directories);

        if(this.durationTimer) {
            this.timers.duration = this.durationTimer.end();
        }

        // extra protection: ensure failure events are sent for any non successful rendition
        if(this.renditions){
            this.renditions.forEach(async (rendition) => {
                if (!rendition.eventSent) {
                    await this.events.sendEvent(EVENT_RENDITION_FAILED, {
                        rendition: rendition.instructionsForEvent(),
                        errorReason: Reason.GenericError,
                        errorMessage: "Unknown error"
                    });
                    rendition.eventSent = true;
                }
            });
        }

        const cgroupMetrics = {};
        if(this.cgroupSampler) {
            const cgroup = await this.cgroupSampler.finish();
            Object.keys(cgroup).forEach(key => {
                if (key) {
                    cgroupMetrics[key.replace('cpuacct', "cpu")] = cgroup[key];
                }
            });
        }
        if (this.timers) {
            delete this.timers.currentProcessing;
            delete this.timers.currentUpload;
        }

        const metrics = Object.assign({}, cgroupMetrics || {}, this.timers);

        // send final metrics
        await this.metrics.sendMetrics('activation', metrics);
        this.metrics.activationFinished();

        // if data clean up fails (leftover directories),
        // we kill the container to avoid data leak
        if(!cleanupSuccess && !process.env.WORKER_TEST_MODE){
            // might want to avoid exit when unit testing...
            console.log("Cleanup was not successful, killing container to prevent further use for action invocations");
            process.exit(CLEANUP_FAILED_EXIT_CODE);
        }
    }

    getResult(err) {
        const result = {
            // TODO: return: rendition names/sizes, metrics, just some stats when doing `wsk activation get`
        };

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
