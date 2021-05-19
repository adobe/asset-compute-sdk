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
const path = require("path");
const { Engine, Plan } = require("@adobe/asset-compute-pipeline");
const WorkerCallbackTransformer = require('./worker-transformer');
const debug = require("debug")("pipeline.engine");

/**
 * Worker where the renditionCallback is called for each rendition.
 * One worker instantiates a pipeline, which executes one or more transformers in sequence
 *
 * @param {*} renditionCallback callback called for each rendition, must convert source into rendition
 *                              signature: (source, rendition)
 *                              required
 * @param {*} options optional options
 */
function worker(renditionCallback, options = {}) {
    console.log("## worker(renditionCallback, options={})");

    if (typeof renditionCallback !== "function") {
        throw new Error("renditionCallback must be a function");
    }

    return actionWrapper(async function (params) {
        const { promisify } = require('util');
        const sleep = promisify(setTimeout);
        await sleep(2000);
        console.log("## worker(renditionCallback) -> actionWrapper");

        const transformer = await createTransformerFromWorker(renditionCallback, options);

        const pipeline = new Engine();
        pipeline.registerTransformer(transformer);

        const plan = new Plan();

        debug("params:", params);

        // TODO: WORKER_TEST_MODE: copy from /in
        // for test-worker framework, input and output are mounted at /in and /out
        // random access reading and writing from that mount can be problematic on Docker for Mac at least,
        // so we are copying all files over into the container
        // if (process.env.WORKER_TEST_MODE) {
        //     try {
        //         await fs.copy("/in", directories.in);
        //     } catch (e) {
        //         // sometimes this fails sporadically for unknown reason, so we retry once
        //         console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed, retrying... (${e.message})`);
        //         try {
        //             await fs.copy("/in", directories.in);
        //         } catch (e) {
        //             console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed:`);
        //             throw e;
        //         }
        //     }
        // }

        // note, we will need to add support for multiple renditions
        // note, we have to integrate options into our plan and support everything we support now
        plan.add(transformer.name, { input: params.source, output: params.renditions[0] });

        console.log('Plan:', plan.toObject());

        return pipeline.run(plan);

        // TODO: WORKER_TEST_MODE: copy result to /out

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
function batchWorker(renditionsCallback, options = {}) {
    if (typeof renditionsCallback !== "function") {
        throw new Error("renditionsCallback must be a function");
    }

    return actionWrapper(function (params) {
        return new AssetComputeWorker(params, options).computeAllAtOnce(renditionsCallback);
    });
}


function shellScriptWorker(script = "worker.sh", options = {}) {
    ShellScriptWorker.validate(script);

    options.script = script;

    return actionWrapper(function (params) {
        return new ShellScriptWorker(params, options).compute();
    });
}

async function createTransformerFromWorker(renditionCallback, options={}) {
    let manifest;
    if (options.manifestFile) {
        const fullPath = path.resolve(options.manifestFile);
        console.log(`## Looking for manifest file ${fullPath}`);
    
        manifest = await fs.readJson(fullPath);
    } else if (options.manifest) {
        manifest = options.manifest;
    }
    console.log('Manifest', manifest);
    return new WorkerCallbackTransformer(renditionCallback, manifest, "worker");
}

module.exports = {
    worker,
    batchWorker,
    shellScriptWorker
};
