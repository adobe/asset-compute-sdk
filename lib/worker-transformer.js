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
class WorkerCallbackTransformer extends Transformer {

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

    compute(input, output) {
        debug('Using WorkerCallbackTransformer#compute');
        if(typeof this._callback !== "function"){
            throw new Error("compute: renditionCallback must be a function");
        }
        if(this.supportsBatch === true){
            debug('Using non-batch mode but the transformer claims batch support in manifest');
        }

        return this._callback(input, output, input.params);
    }

    computeAllAtOnce(input, output) {
        debug('Using WorkerCallbackTransformer#computeAllAtOnce');
        if(typeof this._callback !== "function"){
            throw new Error("computeAllAtOnce: renditionCallback must be a function");
        }
        if(!this.supportsBatch){
            debug('Using batch mode but the transformer does not claim batch support in manifest');
        }

        return this._callback(input, output, input.params);
    }
}

module.exports = WorkerCallbackTransformer;
