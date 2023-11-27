/*
 * Copyright 2023 Adobe. All rights reserved.
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

const { Transformer } = require("@adobe/asset-compute-pipeline");

class ShellscriptCallbackTransformer extends Transformer {

    /**
     * Construct a transformer for shellscript workers
     * @param {*} callback
     * @param {*} manifest worker manifest (only one, not a list)
     */
    constructor(callback, manifest) {
        super(`shellscript-workerCallback-${manifest.name}`, manifest);
        this._callback = callback;
    }

    async compute(input, output) {
        console.log('ShellscriptCallbackTransformer#compute#compute');
        console.log("Execute script here!");
    }
}

module.exports = ShellscriptCallbackTransformer;