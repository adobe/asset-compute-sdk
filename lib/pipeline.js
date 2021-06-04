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

const debug = require("debug")("asset-compute-sdk:AssetComputePipeline");
const { Engine, Plan } = require("@nui/asset-compute-pipeline");
const WorkerCallbackTransformer = require('./worker-transformer');

class AssetComputePipeline {
    constructor(options={}){
        this.pipelineId = 'bleh';
        this.options = options;

        this.transformers = [];
        if(options.transformerCatalog){
            debug('Adding transformers from transformer catalog to the pipeline');
            this.transformers = this.transformers.concat(options.transformerCatalog);
        }
    }

    /**
     * Builds transformers from manifests defined in the options object
     * @param {*} renditionCallback worker rendition callback to use in the built transformer
     * @param {*} options options, must contain manifests (if not - will not create any transformer)
     * @returns a list of transformers available for this pipeline instance
     */
    async buildTransformersFromManifests(renditionCallback) {
        if (!this.options.manifests) {
            debug('No additional manifest in the pipeline options, no additional WorkerCallbackTransformer added to pipeline');
            return this.transformers;
        }

        const manifests = this.options.manifests;
        debug('Manifest array', manifests);
    
        const transformers = [];
        manifests.forEach(manifest => {
            const transformer = new WorkerCallbackTransformer(renditionCallback, manifest);

            debug(`Created a transformer named ${transformer.name} with manifest:`);
            debug(manifest);

            transformers.push(transformer);
        });

        debug(`Adding ${transformers.length} WorkerCallbackTransformer to the pipeline`);
        this.transformers = transformers.concat(options.transformerCatalog);
        
        return this.transformers;
    }

    compute(renditionCallback, params){
        const pipeline = new Engine(params);
        const transformers = await this.buildTransformersFromManifests(renditionCallback, options);
        transformers.forEach( eachTransformer => {
            console.log('##### transformer', eachTransformer.name);
            pipeline.registerTransformer(eachTransformer);
        });

        // pass through params for events, metrics and other authorization

        const plan = new Plan();

        console.log("######## params:", params);
        let input = params.source;

        // TODO WORKER_TEST_MODE: copy from /in
        // for test-worker framework, input and output are mounted at /in and /out
        // random access reading and writing from that mount can be problematic on Docker for Mac at least,
        // so we are copying all files over into the container
        if (process.env.WORKER_TEST_MODE) {
            const testDir = 'test-folder-in';
            try {
                await fs.copy("/in", testDir);
            } catch (e) {
                // sometimes this fails sporadically for unknown reason, so we retry once
                console.log(`WORKER_TEST_MODE: copying /in to ${testDir} failed, retrying... (${e.message})`);
                try {
                    await fs.copy("/in", testDir);
                } catch (e) {
                    console.log(`WORKER_TEST_MODE: copying /in to ${testDir} failed:`);
                    throw e;
                }
            }
            input = {
                path: `${testDir}/${params.source}`
            };
        }
        // TODO we will need to add support for multiple renditions
        // TODO we have to integrate options into our plan and support everything we support now
        
        pipeline.refinePlan(plan, input, params.renditions[0]);

        const pipelineOutput = await pipeline.run(plan);
        debug("######## pipelineOutput:", pipelineOutput);

        // TODO: WORKER_TEST_MODE: copy result to /out
        if(process.env.WORKER_TEST_MODE){
            await fs.copy(path.dirname(pipelineOutput.rendition), "/out", {
                // Make sure symlinks are copied as binaries and not symlinks
                dereference: true,

                // ensure files can be read by host system by running chmod before copy
                filter: src => {
                    fs.chmodSync(src, 0o766);
                    console.log(`WORKER_TEST_MODE: copying ${src} to /out`);
                    return true;
                }
            });
        }
    }
}

module.exports = {
    AssetComputePipeline
};