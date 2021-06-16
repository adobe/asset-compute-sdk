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
const { Transformer } = require("@nui/asset-compute-pipeline");

class BatchWorkerCallbackTransformer extends Transformer {

    /**
     * 
     * @param {*} callback 
     * @param {*} manifest worker manifest (only one, not a list)
     */
    constructor(callback, manifest) {
        super(`workerCallback-${manifest.name}`, manifest);

        if(this.manifest.inputs.hasBatchMode === true || this.manifest.inputs.hasBatchMode === true){
            console.log(`Transformer ${this.name} supports batch mode`);
            this._canDoBatchMode = true;
        }

        this._callback = callback;
    }

    get supportsBatch(){
        return this._canDoBatchMode;
    }

    async compute(input, output) {
        debug('Using BatchWorkerCallbackTransformer#compute');
        if(typeof this._callback !== "function"){
            throw new Error("compute: renditionCallback must be a function");
        }

        debug(`Computation batch support: ${this.supportsBatch}`);


        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('transformer compute input from worker-transformer (before compute):')
        debug(input);
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug("");
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('transformer compute output from worker-transformer (before compute):')
        debug(output);
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        debug('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
        return this._callback(input, output, output.directory);
    }
}

module.exports = BatchWorkerCallbackTransformer;
