/*
 * Copyright 2021 Adobe. All rights reserved.
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

const debug = console.log;
const { Engine, Plan } = require('@nui/asset-compute-pipeline');
const { getImageMetadata } = require('./postprocessing/image.js')
const WorkerCallbackTransformer = require('./worker-transformer');
const BatchWorkerCallbackTransformer = require('./batch-worker-transformer');
const Rendition = require('./rendition');

const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');

// make source mimetypes align to Manifest
const SOURCE_TYPE_MAP = {
    "image/jpg" : "image/jpeg",
    "image/tif" : "image/tiff"
};
const DEFAULT_MIMETYPE = 'application/octet-stream';

/**
 * Represents a pipeline build around a worker callback.
 * Mostly here for backwards compatibility.
 */
class AssetComputeWorkerPipeline {
    constructor(renditionCallback, options={}){
        this.options = options;

        // set by compatibility layer
        this.options.hasBatchModeWorker = options.isBatchWorker || false;
        
        this.transformers = [];
        this.buildTransformersFromManifests(renditionCallback);

        if(this.options.transformerCatalog){
            debug("Adding transformers from transformer catalog to the pipeline");
            this.transformers = this.transformers.concat(options.transformerCatalog);
        } else if(this.options.transformerList){
            this.options.transformerList.forEach(transformerListItem => {
                if(transformerListItem.catalog){
                    // there is a whole catalog to add
                    console.log('#### Adding a whole catalog to known transformers')
                    this.transformers = this.transformers.concat(transformerListItem.catalog);
                } else {
                    // only one transformer
                    console.log('#### Adding a SINGLE transformer to known transformers')
                    this.transformers.push(transformerListItem);
                }
            });
        }
        debug("Built worker transformer using rendition callback 'renditionCallback'");

        // set by compatibility layer
        this.options.hasBatchModeWorker = options.isBatchWorker || false;
    }

    /**
     * Builds transformers from manifests defined in the options object
     * @param {*} renditionCallback worker rendition callback to use in the built transformer
     * @param {*} options options, must contain manifests (if not - will not create any transformer)
     * @returns a list of transformers available for this pipeline instance
     */
    buildTransformersFromManifests(renditionCallback) {
        if (!this.options.manifest) {
            debug("No additional manifest in the pipeline options, no additional WorkerCallbackTransformer added to pipeline");
            return this.transformers;
        }

        //const transformer = new WorkerCallbackTransformer(renditionCallback, this.options.manifest);
        let transformer;
        if (this.options.hasBatchModeWorker === true) {
            debug("Creating a batch worker");
            transformer = new BatchWorkerCallbackTransformer(renditionCallback, this.options.manifest);
        } else {
            debug("Creating a normal worker");
            transformer = new WorkerCallbackTransformer(renditionCallback, this.options.manifest);
        }

        debug(`Created a transformer named ${transformer.name} with manifest:`);
        this.transformers.push(transformer);
        
        debug(`Adding ${transformer.name} WorkerCallbackTransformer to the pipeline`);
    }

    prepareEngine(params){
        debug("Preparing pipeline engine... ");
        const engine = new Engine(params);

        this.transformers.forEach(transformer => {
            console.log(`Registering transformer ${transformer.name} to the pipeline's engine`);
            engine.registerTransformer(transformer);
            // console.log('## transformer manifest: ');
            // console.log(transformer.manifest);
        });

        return engine;
    }

    normalizeInputOuput(input, output) {
        // TODO: we will have special cases for beta-worker-creative 
        // special case for sensei
        if(output.fmt === 'machine-metadata-json') {
            output.type = 'machine-metadata-json';
        } else {
            // rendition.fmt should always exist
            const mimetype = mime.lookup(output.fmt && output.fmt.toLowerCase());
            output.type = mimetype && mimetype.toLowerCase();
        }


        // if source.mimetype does not exist, or it does not match the extension,
        // try to find mimetype by mapping the extension
        // this can happen if the client (for example the devtool) does not define the content-type correctly
        let type;
        if ((!input.mimetype || input.mimetype === DEFAULT_MIMETYPE) && input.name) {
            debug(`Looking up mimetype from input: ${input.mimetype}`);
            const inputExtension = path.extname(input.name);
            const inputMimetype = mime.lookup(inputExtension.toLowerCase());
            type = (inputMimetype && inputMimetype.toLowerCase()) || DEFAULT_MIMETYPE;
        } else {
            type = input.mimetype && input.mimetype.toLowerCase();
        }

        if (type) {
            input.type = SOURCE_TYPE_MAP[type] || (type && type.toLowerCase());
        }

        // plan alg will throw error and send io events
        if (!input.type) {
            //TODO should throw ClientError ?
            console.log("Input type is unknown: pipeline won't be able to find a plan and will throw error");
        }
        if (!output.type) {
            //TODO should throw ClientError ?
            console.log("Output type is unknown: pipeline won't be able to find a plan and will throw error");
        }
    }

    async compute(params){
        const engine = this.prepareEngine(params);
        debug("Created pipeline engine");

        // pass through params for events, metrics, other authorization, ...
        const plan = new Plan();
        debug("Created initial plan");

        let input = params.source;

        // WORKER_TEST_MODE: 
        // for test-worker framework, input and output are mounted at /in and /out
        // random access reading and writing from that mount can be problematic on Docker for Mac at least,
        // so we are copying all files over into the container
        debug("process.env.WORKER_TEST_MODE:", process.env.WORKER_TEST_MODE);
        if (process.env.WORKER_TEST_MODE) {
            const testDir = 'test-folder-in';
            try {
                debug(`WORKER_TEST_MODE: copying /in to ${testDir}`);
                await fs.copy("/in", testDir);
                debug(`WORKER_TEST_MODE: Copied files from /in to ${testDir}`);
            } catch (e) {
                // sometimes this fails sporadically for unknown reason, so we retry once
                debug(e);
                debug(`WORKER_TEST_MODE: copying /in to ${testDir} failed, retrying... (${e.message})`);
                try {
                    await fs.copy("/in", testDir);
                } catch (e) {
                    debug(`WORKER_TEST_MODE: copying /in to ${testDir} failed:`);
                    throw e;
                }
            }

            input = {
                path: `${testDir}/${params.source}`,
                name: params.source
            };

            const sourceMetadata = await getImageMetadata(input.path); // needed for colorspace, TODO-tmn: move to better location

            // update input accordingly
            input.colorspace = sourceMetadata.colorspace; // TODO-tmn: get the info from exiftool

            const inputExtension = path.extname(params.source);
            const inputMimetype = mime.lookup(inputExtension.toLowerCase());
            input.mimetype = inputMimetype && inputMimetype.toLowerCase();
        }

        // TODO-tmn `/` as path is a placeholder
        const rendition = Rendition.forEach(params.renditions, "/");

        const output = params.renditions[0];
        const outputInstructionsToExecute = rendition[0];

        // normalize source and rendition
        this.normalizeInputOuput(input, output);
        // TODO: type check to make sure input/output are objects so we don't throw here if they are not?
        debug(`Input for refinePlan: ${JSON.stringify(input, null, 1)}`);
        debug(`Output for refinePlan: ${JSON.stringify(output, null, 1)}`);
        // TODO we will need to add support for multiple renditions
        // TODO we have to integrate options into our plan and support everything we support now
        
        
        // REVIEW-tmn: Quick and dirty hack to easily get instructions.
        // Introduces the concept of "processing instructions", which are the operations to execute
        // To be done nicer for a productized thing.
        const outputInstructions = {
            output: output,
            instructionsToExecute: new Set(Object.keys(outputInstructionsToExecute.instructions))
        };
        // "clean" instructions to only have processing instructions
        ['fmt', 'name', 'pipeline', 'type'].forEach(function(instruction) {
            outputInstructions.instructionsToExecute.delete(instruction); 
        });
        
        const contextualPlan = {
            plan: plan,
            planContext: {}
        };

        await engine.refinePlan(contextualPlan, input, outputInstructions);
        // debug("Refined plan to create rendition");
        // debug('=================> Going with plan: ')
        // console.log(contextualPlan);

        debug(`=================> Running pipeline using plan: ${contextualPlan.plan.toString()}`);
        return engine.run(contextualPlan);
    }
}

module.exports = {
    AssetComputeWorkerPipeline
};
