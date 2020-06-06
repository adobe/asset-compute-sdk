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

const clone = require('clone');
const AssetComputeWorker = require('./worker');
const proc = require('process');
const actionWrapper = require('./webaction');

const { Deprecation } = require("deprecation"); // we should start to deprecate this, so we get rid of the old API

// bridge new to old rendition object passed to callback
function mapRendition(rendition) {
    return Object.assign(
        clone(rendition.instructions),
        {
            name: rendition.name
        }
    );
}

function mapOptions(options) {
    // support old misspelled option
    if (options.disableSourceDownloadSource) {
        options.disableSourceDownload = true;
        delete options.disableSourceDownloadSource;
    }
}

async function process(params, options, workerFn) {
    console.warn(new Deprecation("[sdk][deprecation-warning] process() is deprecated, use batchWorker() instead"));

    function main(params) {
        if (typeof options === "function") {
            workerFn = options;
            options = {};
        }

        mapOptions(options);

        const worker = new AssetComputeWorker(params, options);

        return worker.computeAllAtOnce((source, renditions, outDirectory) => {
            return workerFn(source.path, renditions.map(mapRendition), outDirectory);
        });
    }

    return actionWrapper(main)(params);
}

async function forEachRendition(params, options, workerFn) {
    console.warn(new Deprecation("[sdk][deprecation-warning] forEachRendition() is deprecated, use worker() instead"));

    function main(params) {
        if (typeof options === "function") {
            workerFn = options;
            options = {};
        }

        mapOptions(options);

        const worker = new AssetComputeWorker(params, options);

        return worker.compute((source, rendition) => {
            let workerSource;
            // disableSourceDownload means we do not download the source file
            // the url is left in the source object in case it is needed inside the worker
            if (options && options.disableSourceDownload && !proc.env.WORKER_TEST_MODE) {
                workerSource = source.url;
            } else {
                workerSource = source.path;
            }
            return workerFn(workerSource, mapRendition(rendition), rendition.directory);
        });
    }

    return actionWrapper(main)(params);
}

module.exports = {
    process,
    forEachRendition
};
