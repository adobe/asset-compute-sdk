/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

'use strict';

const Source = require('./source');
const { AssetComputeLogUtils } = require('@adobe/asset-compute-commons');
const http = require('./storage/http');
const datauri = require('./storage/datauri');
const URL = require('url');
const fs = require("fs-extra");
const path = require('path');

const DATA_PROTOCOL = 'data:';

function isValidLocalFile(fileName, basePath){
    const fullPath = path.join(basePath, fileName);
    if ( (!fullPath.startsWith("/in")) || fullPath.endsWith("/..") || fullPath.includes("/../")) {
        return false;
    }
    return fs.existsSync(fullPath);
}

async function getSource(paramsSource, inDirectory, disableSourceDownload) {
    // Note: validation has happened in validate.js before

    if (process.env.WORKER_TEST_MODE) {
        // local file support for `Asset Compute test-worker` unit tests
        // not supported for clients in production
        if (!isValidLocalFile(paramsSource.url, inDirectory)) {
            throw new Error(`Invalid or missing local file ${paramsSource.url}`);
        }
        return new Source(paramsSource.url, inDirectory);

    } else {
        const source = new Source(paramsSource, inDirectory);
        if (disableSourceDownload) {
            console.log(`Skipping source file download for ${AssetComputeLogUtils.redactUrl(source.url)}`);
        } else {
            // TODO: error handling: errors catched & thrown in http.download() and then catched again in worker.js ???
            // download http/https url into file
            const protocol = URL.parse(paramsSource.url).protocol;
            if (protocol === DATA_PROTOCOL) {
                await datauri.download(paramsSource, source.path);
            } else {
                await http.download(paramsSource, source.path);
            }
        }

        return source;
    }
}

async function putRendition(rendition) {
    // Note: validation has happened in validate.js before

    if (process.env.WORKER_TEST_MODE) {
        // asset-compute-cli command run-worker wants file named as originally requested
        // however, computing the metadata wants the current path, so
        // we need to make a copy not just rename
        if (rendition.instructions.name) {
            const newPath = path.join(rendition.directory, rendition.instructions.name);
            await fs.copyFile(rendition.path, newPath);
        }
    } else if (!rendition.inline()) {
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition
}
