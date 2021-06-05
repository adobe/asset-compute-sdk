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
const WorkerCallbackTransformer = require('./worker-transformer');

const fs = require('fs-extra');
const path = require('path');

/**
 * Represents a pipeline build around a worker callback.
 * Mostly here for backwards compatibility.
 */
class AssetComputeWorkerPipeline {
    constructor(renditionCallback, options={}){
        this.options = options;

        this.transformers = [];
        if(this.options.transformerCatalog){
            debug("Adding transformers from transformer catalog to the pipeline");
            this.transformers = this.transformers.concat(options.transformerCatalog);
        }

        this.buildTransformersFromManifests(renditionCallback);
        debug("Built worker transformer using rendition callback 'renditionCallback'");
    }

    /**
     * Builds transformers from manifests defined in the options object
     * @param {*} renditionCallback worker rendition callback to use in the built transformer
     * @param {*} options options, must contain manifests (if not - will not create any transformer)
     * @returns a list of transformers available for this pipeline instance
     */
    buildTransformersFromManifests(renditionCallback) {
        if (!this.options.manifests) {
            debug("No additional manifest in the pipeline options, no additional WorkerCallbackTransformer added to pipeline");
            return this.transformers;
        }

        const manifests = this.options.manifests;
        debug('Manifest array', manifests);
    
        let transformers = [];
        manifests.forEach(manifest => {
            const transformer = new WorkerCallbackTransformer(renditionCallback, manifest);

            debug(`Created a transformer named ${transformer.name} with manifest:`);
            debug(manifest);

            transformers.push(transformer);
        });

        debug(`Adding ${transformers.length} WorkerCallbackTransformer to the pipeline`);
        this.transformers = transformers.concat(this.options.transformerCatalog);
    }

    prepareEngine(params){
        debug("Preparing pipeline engine... ")
        const engine = new Engine(params);

        this.transformers.forEach(transformer => {
            console.log(`Registering transformer ${transformer.name} to the pipeline's engine`);
            engine.registerTransformer(transformer);
        });

        return engine;
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

            // update input accordingly
            input = {
                path: `${testDir}/${params.source}`
            };
            debug('######### input:', input)
        }

        // TODO we will need to add support for multiple renditions
        // TODO we have to integrate options into our plan and support everything we support now
        
        debug("Preparing plan for rendition creation...");
        engine.refinePlan(plan, input, params.renditions[0]);
        debug("Refined plan to create rendition");

        debug("Running pipeline...");
        const pipelineOutput = await engine.run(plan);
        debug("Pipeline finished running");
        debug("######## pipelineOutput:", pipelineOutput);

        // WORKER_TEST_MODE: copy result to /out
        if(process.env.WORKER_TEST_MODE){
            await fs.copy(path.dirname(pipelineOutput.rendition), "/out", {
                // Make sure symlinks are copied as binaries and not symlinks
                dereference: true,

                // ensure files can be read by host system by running chmod before copy
                filter: src => {
                    fs.chmodSync(src, 0o766);
                    debug(`WORKER_TEST_MODE: copying ${src} to /out`);
                    return true;
                }
            });
        }
    }
}

module.exports = {
    AssetComputeWorkerPipeline
};