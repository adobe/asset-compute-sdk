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

const http = require('@adobe/httptransfer');
const { AssetComputeLogUtils, GenericError, RenditionTooLarge } = require('@adobe/asset-compute-commons');
const { actionName } = require('./action');
// const { Rendition } = require('./rendition');

const MAX_RETRY_DURATION_UPLOAD = 900000; // 15 mins

async function download(asset, file) {
    try {
        console.log(`downloading asset ${AssetComputeLogUtils.redactUrl(asset.url)} into ${file}\nheaders:`, asset.headers);

        await http.downloadFile(asset.url, file, {
            retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
            headers: asset.headers
        });
        console.log('download finished successfully');

    } catch (err) {
        throw new GenericError(err.message, `${actionName()}_download`);
    }
}

/**
 * Upload Rendition to the remote target URL
 * @param {Rendition} rendition 
 * @returns void
 */
async function upload(rendition) {
    const file = rendition.path;
    const target = rendition.target;
    if (!target) {
        console.warn(`rendition ${rendition.id()} does not have a target`);
        return;
    }

    if (!file) {
        throw new GenericError(`rendition ${rendition.id()} does not have a file path: ${file}`, `${actionName()}_upload`);
    }

    const contentType = await rendition.contentType();
    try {
        if (typeof target === 'string') {
            console.log(`uploading rendition ${file} to ${AssetComputeLogUtils.redactUrl(target)}, size = ${rendition.size()}`);
            await http.uploadFile(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                headers: {
                    'content-type': contentType
                }
            });
            console.log(`successfully finished uploading rendition`);

        } else if (typeof target === 'object' && Array.isArray(target.urls)) {
            console.log(`uploading rendition ${file} as multi-part to ${AssetComputeLogUtils.redactUrl(target.urls[0])} and ${target.urls.length-1} more urls, size = ${rendition.size()}`);
            await http.uploadAEMMultipartFile(file, target, {
                retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
                retryMaxDuration: process.env.ASSET_COMPUTE_TEST_RETRY_DURATION || MAX_RETRY_DURATION_UPLOAD,
                headers: {
                    'content-type': contentType
                }
            });
            console.log(`successfully finished uploading rendition`);
        }
    } catch (err) {
        console.log(err);
        if (err.message && err.message.includes('is too large to upload') || err.status === 413) {
            throw new RenditionTooLarge(`rendition size of ${rendition.size()} for ${rendition.name} is too large`);
        } else {
            throw new GenericError(err.message, `${actionName()}_upload`);
        }
    }
}
/**
 * Is location a remote (http/https) path or local filesystem path?
 * @param {Rendition} output rendition
 * @returns true if rendition has a target and it is an http location
 */
 function isRemoteLocation(rendition) {
    if (!rendition || !rendition.target) {
        // This also covers test cases where rendition is a simple path and not a full rendition object
        return false;
    } else {
        return rendition.target.toLowerCase().startsWith("http");
    }
}

async function uploadOutput(pipelineOutput) {
    // WORKER_TEST_MODE: copy result to /out
    if(process.env.WORKER_TEST_MODE || !isRemoteLocation(pipelineOutput.rendition)) {
        await fs.copy(path.dirname(pipelineOutput.rendition), "/out", {
            // Make sure symlinks are copied as binaries and not symlinks
            dereference: true,

            // ensure files can be read by host system by running chmod before copy
            filter: src => {
                fs.chmodSync(src, 0o766);
                console.log(`WORKER_TEST_MODE: copying ${src} to /out`);
                return true;
            }
        });
    } else if (isRemoteLocation(pipelineOutput.rendition) || !pipelineOutput.rendition.shouldEmbedInIOEvent()) {
        await upload(pipelineOutput.rendition);
    }
}

module.exports = {
    download,
    upload,
    uploadOutput
};