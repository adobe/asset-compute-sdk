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

const { AssetComputeMetrics, AssetComputeEvents, GenericError, Reason } = require('@nui/asset-compute-commons');
const fs = require("fs-extra");

const { actionName } = require('./action');
const {createDirectories, cleanupDirectories} = require('./prepare');
const {validateParameters} = require('./validate');
const Timer = require('./utils/timer');
const { getSource, putRendition } = require('./storage');
const Rendition = require('./rendition');

const EVENT_RENDITION_CREATED = "rendition_created";
const EVENT_RENDITION_FAILED = "rendition_failed";

const METRIC_RENDITION = "rendition";

class AssetComputeWorker {
    constructor(params, options={}){
        this.params = params;
        this.options = options;

        validateParameters(this.params);

        this.metrics = new AssetComputeMetrics(this.params);
        this.events  = new AssetComputeEvents(this.params);
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

    computeUsingShellscript() { // shellscriptWorker
        // TODO: move to different class/file, which provides its own callback
        throw new Error("computeUsingShellscript no implemented yet");
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

        this.durationTimer = new Timer();
        this.timers = {
            duration: 0,
            download: 0,
            processing: 0,
            upload: 0,
            currentProcessing: 0,
            currentUpload: 0
        };

        this.directories = await createDirectories();

        this.renditions = Rendition.forEach(this.params.renditions, this.directories.out);

        const downloadTimer = new Timer();

        this.source = await getSource(
            this.params.source,
            this.directories.in,
            this.options.disableSourceDownload
        );

        this.timers.download = downloadTimer.end();
        console.log(`source downloaded in ${downloadTimer.duration()} seconds`);
    }

    async processRendition(rendition, renditionCallback) {
        this.timers.currentProcessing = new Timer();
        try {
            console.log(`generating rendition ${rendition.id()}...`);
            console.log(rendition.instructionsForEvent());

            // call client-provided callback to transform source into 1 rendition
            await renditionCallback(this.source, rendition);

            this.timers.currentProcessing.end();
            console.log(`rendition finished in ${this.timers.currentProcessing.duration()} seconds`);

            // check if rendition was created
            if (! await fs.exists(rendition.path)) {
                throw new GenericError("No rendition generated");
            }

        } catch (err) {
            await this.renditionFailure(rendition, err);

            // continue with next rendition
            return;
        }

        // 2. check and log resulting rendition

        console.log(`rendition generated: ${rendition.name}, size = ${rendition.size()}`);

        this.timers.processing += this.timers.currentProcessing.duration();

        // TODO: if upload fails, send errors and continue with next rendition
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
            console.log(`renditions finished in ${this.timers.currentProcessing.duration()} seconds`);

        } catch (err) {
            // TODO: just send 1 metric
            // we cannot check if some renditions were properly generated or not,
            // so we have to assume everything failed
            for (const rendition of this.renditions) {
                // TODO: pass err to all IO events
                // TODO: just end IO events
                await this.renditionFailure(rendition, "No rendition generated");
            }
        }

        for (const rendition of this.renditions) {
            // check if rendition was created
            if (await fs.exists(rendition.path)) {
                try {
                    await this.upload(rendition);
                } catch (err) {
                    if (!rendition.eventSent) {
                        await this.renditionFailure(rendition, err.message || err);
                    } 
                }
            } else {
                await this.renditionFailure(rendition, "No rendition generated");
            }
        }
    }

    async upload(rendition) {
        this.timers.currentUpload = new Timer();

        await putRendition(rendition);

        this.timers.upload += this.timers.currentUpload.end();

        await this.renditionSuccess(rendition);
    }

    async renditionSuccess(rendition) {
        // TODO: what if sending event fails after retry? do we need to do something here?
        await this.events.sendEvent(EVENT_RENDITION_CREATED, {
            rendition: rendition.instructionsForEvent(),
            metadata: await rendition.metadata()
        });

        rendition.eventSent = true;

        await this.metrics.sendMetrics(METRIC_RENDITION, {
            ...rendition.instructions,
            // TODO: move timers or timer results to Rendition class
            processingDuration: this.timers.currentProcessing.duration(),
            uploadDuration: this.timers.currentUpload.duration(),
            size: rendition.size()
        });
    }

    async renditionFailure(rendition, err) {
        // one IO Event per failed rendition
        // TODO: if err is type ClientError, send that as errorReason
        await this.events.sendEvent(EVENT_RENDITION_FAILED, {
            rendition: rendition.instructionsForEvent(),
            errorReason: (err && err.reason) || Reason.GenericError,
            errorMessage: err ? (err.message || err) : undefined
        });

        rendition.eventSent = true;

        // one metric per failed rendition
        await this.metrics.handleError(err, {
            location: `${actionName()}_process`,
            metrics: {
                processingDuration: this.timers.currentProcessing.duration(),
            },
            message: err ? (err.message || err) : undefined
        });
    }

    async cleanup() {
        // Notes:
        // - cleanup might run at any time, so no assumptions to be made of existence of objects
        // - all these steps should individually catch errors so that all cleanup steps can run
        await cleanupDirectories(this.directories);

        this.timers.duration = this.durationTimer.end();

        // extra protection: ensure failure events are sent for any non successful rendition
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

        // TODO: send final metrics
    }

    getResult(err) {
        const result = {
            // TODO: redact credentials
            params: this.params
            // TODO: return: rendition names/sizes, metrics, just some stats when doing `wsk activation get`
        };

        if (err) {
            return Object.assign(err, result);
        } else {
            return result;
        }
    }
}

// -----------------------< exports >-----------------------------------
module.exports = AssetComputeWorker;
