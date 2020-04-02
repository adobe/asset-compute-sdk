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
const { readMetadataFromFile } = require('./metadata');

const { Sampler } = require('@nui/metrics-sampler');
const { metrics: cgroupMetrics, cpu} = require('cgroup-metrics');

const CLEANUP_FAILED_EXIT_CODE = 231;

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";

const METRIC_RENDITION = "rendition";

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

class AssetComputeWorker {

    /**
     * Construct Asset Compute Worker
     * 
     * @param {*} params Worker parameters
     * @param {Boolean} [options.disableSourceDownload=false] Disable source download
     * @param {Boolean} [options.disableRenditionUpload=false] Disable rendition upload
     */
    constructor(params, options={}){
        this.workerStartTime = new Date();

        this.params = params;
        this.options = options;

        validateParameters(this.params);

        this.events  = new AssetComputeEvents(this.params);
        this.metrics = params.metrics || new AssetComputeMetrics(params);
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
            upload: 0,
            currentProcessing: 0,
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
        const timer = this.timers.currentProcessing = new Timer();
        try {
            console.log(`generating rendition ${rendition.id()} (${rendition.name})...`);
            console.log(rendition.instructionsForEvent());

            // call client-provided callback to transform source into 1 rendition
            await renditionCallback(this.source, rendition, this.params);

            timer.end();

            // check if rendition was created
            if (! this.options.disableRenditionUpload && ! await fse.exists(rendition.path)) {
                console.error(`no rendition found at: ${rendition.path}`);
                throw new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_process_norendition`);
            }

        } catch (err) {
            console.error(`processing failed with error after ${timer.durationSec()} seconds: ${err.message || err}`);
            await this.renditionFailure(rendition, err);

            // continue with next rendition
            return;
        }

        // 2. check and log resulting rendition

        console.log(`rendition generated in ${timer.durationSec()} seconds: ${rendition.name}`);

        this.timers.processing += timer.duration();

        if (this.options.disableRenditionUpload) {
            await this.renditionSuccess(rendition);
        } else {
            await this.upload(rendition);
        }
    }

    async batchProcessRenditions(renditionsCallback) {
        const timer = this.timers.currentProcessing = new Timer();
        try {
            console.log(`generating all ${this.renditions.length} renditions...`);
            for (const rendition of this.renditions) {
                console.log(rendition.instructionsForEvent());
            }

            // call client-provided callback to transform source into 1 rendition
            await renditionsCallback(this.source, this.renditions, this.directories.out, this.params);

            timer.end();
            console.log(`processing finished successfully after ${timer.durationSec()} seconds`);

        } catch (err) {
            console.error(`processing failed with error after ${timer.durationSec()} seconds: ${err.message || err}`);
            // just send 1 metric, but individual IO events per rendition
            await this.metrics.handleError(err, {
                location: `${this.actionName}_batchProcess`,
                metrics: {
                    processingDuration: timer.duration(),
                }
            });
            // we cannot check if some renditions were properly generated or not,
            // so we have to assume everything failed
            for (const rendition of this.renditions) {
                await this.renditionFailure(rendition, err, true);
            }
            return;
        }

        for (const rendition of this.renditions) {
            if (this.options.disableRenditionUpload) {
                await this.renditionSuccess(rendition);
            } else if (await fse.exists(rendition.path)) {
                await this.upload(rendition);
            } else {
                console.error(`no rendition found at: ${rendition.path}`);
                await this.renditionFailure(rendition, new GenericError(`No rendition generated for ${rendition.id()}`, `${this.actionName}_batchProcess_norendition`));
            }
        }
    }

    async upload(rendition) {
        try {
            rendition.metadata = await readMetadataFromFile(rendition.path);

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
            metadata: rendition.metadata,
            activationIds: this.params.customWorker ? [process.env.__OW_ACTIVATION_ID] : undefined
        });

        rendition.eventSent = true;

        await this.metrics.sendMetrics(METRIC_RENDITION, {
            // rendition instructions
            ...instructions,
            renditionName: instructions.name,
            renditionFormat: instructions.fmt,
            // durations
            downloadDuration: this.timers.download.duration(),
            processingDuration: this.timers.currentProcessing.duration(),
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
                    processingDuration: this.timers.currentProcessing.duration(),
                    renditionDuration: durationSec(this.processingStartTime, renditionDoneTime)
                }
            });
        }
    }

    async cleanup() {
        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run
        const cleanupSuccess = await cleanupDirectories(this.directories);

        this.timers.actionDuration.end();

        // extra protection: ensure failure events are sent for any non successful rendition
        if(this.renditions){
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
        if(this.cgroupSampler) {
            const cgroup = await this.cgroupSampler.finish();
            Object.keys(cgroup).forEach(key => {
                if (key) {
                    cgroupMetrics[key.replace('cpuacct', "cpu")] = cgroup[key];
                }
            });
        }

        // add final metrics (for activation metric)
        this.metrics.add(Object.assign({}, cgroupMetrics || {}, {
            duration: this.timers.actionDuration ? this.timers.actionDuration.duration() : undefined,
            downloadDuration: this.timers.download ? this.timers.download.duration() : undefined,
            processingDuration: this.timers.processing,
            uploadDuration: this.timers.upload
        }));

        // if data clean up fails (leftover directories),
        // we kill the container to avoid data leak
        if(!cleanupSuccess && !process.env.WORKER_TEST_MODE){
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
