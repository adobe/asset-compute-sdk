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

const { Transformer } = require("@nui/asset-compute-pipeline");
const mime = require('mime-types');
class WorkerCallbackTransformer extends Transformer {

    /**
     * 
     * @param {*} callback 
     * @param {*} manifest worker manifest (only one, not a list)
     */
    constructor(callback, manifest) {
        super(`workerCallback-${manifest.name}`, manifest);

        this._callback = callback;
    }

    compute(input, output) {
        console.log('WorkerCallbackTransformer#compute');
        // workers expect fmt defined in the rendition instructions
        if (!output.instructions.fmt) {
            if (output.instructions.type === 'machine-metadata-json') {
                output.instructions.fmt = 'machine-metadata-json';
            } else {
                output.instructions.fmt = mime.extension(output.instructions.type);
            }
        }
        if(typeof this._callback !== "function"){
            throw new Error("renditionCallback must be a function");
        }
        return this._callback(input, output, input.params);
    }
}

module.exports = WorkerCallbackTransformer;
