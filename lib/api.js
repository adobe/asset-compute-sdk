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
const { AssetComputeWorkerPipeline } = require('./worker-pipeline')


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

        // if any rendition needs pipeline, all will go through pipeline
        const usePipeline = params.renditions.some(rendition => {
            return rendition.pipeline && rendition.pipeline === true;
        });

        let computeTask;
        if(usePipeline){
            // here the pipeline only wraps the worker callback
            // and other transformers potentially already available in a transformer catalog
            console.log("## Using pipeline (`AssetComputeWorkerPipeline`)");
            computeTask = new AssetComputeWorkerPipeline(renditionCallback, options).compute(params);
        } else {
            console.log("## Using worker callback (`AssetComputeWorker`)");
            computeTask = new AssetComputeWorker(params, options).compute(renditionCallback);
        }

        return computeTask;
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

module.exports = {
    worker,
    batchWorker,
    shellScriptWorker
};
