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

// TODO: create a transformer from test/test-worker
// register transformer and start pipeline
// const Engine = require("../lib/engine");
// const { Plan } = require("../lib/plan");
const { Transformer } = require("@nui/asset-compute-pipeline");
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
        // TODO: Verify `this._callback` is a function.
        return this._callback(input, output, input.params);
    }
}

module.exports = WorkerCallbackTransformer;
