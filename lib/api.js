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

const AssetComputeWorker = require('./worker');
const ShellScriptWorker = require('./shell/shellscript');
const actionWrapper = require('./webaction');
const fs = require('fs-extra');
const { Engine, Plan } = require("@adobe/asset-compute-pipeline");

const WorkerCallbackTransformer = require('./worker-transformer');

/**
 * Worker where the renditionCallback is called for each rendition.
 * One worker instantiates a pipeline, which executes one or more transformers in sequence
 *
 * @param {*} renditionCallback callback called for each rendition, must convert source into rendition
 *                              signature: (source, rendition)
 *                              required
 * @param {*} options optional options
 */
function worker(renditionCallback, options={}) {
    if (typeof renditionCallback !== "function") {
        throw new Error("renditionCallback must be a function");
    }

    return actionWrapper(async function (params) {
        const transformer = createTransformerFromWorker(renditionCallback);
        
        const pipeline = new Engine();
        pipeline.registerTransformer(transformer);

        const plan = new Plan();
        // note, we will need to add support for multiple renditions
        // note, we have to integrate options into our plan and support everything we support now
        plan.add(transformer.name, { input: params.source, output: params.renditions[0], options });

        console.log('plan', plan.toString());
        const { promisify } = require('util');
        const sleep = promisify(setTimeout);
        await sleep(3000);

        return pipeline.run(plan);

        // return new AssetComputeWorker(params, options).compute(renditionCallback);
    });
}

/**
 * Worker where the renditionsCallback is called once with all renditions.
 *
 * @param {*} renditionsCallback callback called with all rendition, must convert source into all renditions
 *                               signature: (source, renditions)
 *                               required
 * @param {*} options optional options
 */
function batchWorker(renditionsCallback, options={}) {
    if (typeof renditionsCallback !== "function") {
        throw new Error("renditionsCallback must be a function");
    }

    return actionWrapper(function (params) {
        return new AssetComputeWorker(params, options).computeAllAtOnce(renditionsCallback);
    });
}


function shellScriptWorker(script="worker.sh", options={}) {
    ShellScriptWorker.validate(script);

    options.script = script;

    return actionWrapper(function(params) {
        return new ShellScriptWorker(params, options).compute();
    });
}

async function createTransformerFromWorker(renditionCallback, manifestFile = "./pipeline-manifest.json") {
    const rawManifest = await fs.readJson(manifestFile);
    
    return new WorkerCallbackTransformer(renditionCallback, rawManifest, "worker");
}

module.exports = {
    worker,
    batchWorker,
    shellScriptWorker
};
