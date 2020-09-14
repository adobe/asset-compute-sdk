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

const http = require('@adobe/httptransfer');
const { AssetComputeLogUtils, GenericError, RenditionTooLarge } = require('@adobe/asset-compute-commons');
const { actionName } = require('../action');
const mime = require('mime-types');

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';


async function download(source, file) {
    try {
        const contentType = mime.contentType(source.name) || DEFAULT_CONTENT_TYPE;
        console.log(`downloading source: ${AssetComputeLogUtils.redactUrl(source.url)} into ${file}`);

        let headers = {
            'content-type': contentType
        };
        if(source.headers){
            console.log('using additional custom headers')
            Object.assign(headers, source.headers);
        }

        await http.downloadFile(source.url, file, {
            retryEnabled: !process.env.ASSET_COMPUTE_DISABLE_RETRIES,
            headers: headers
        });
        console.log('download finished successfully');

    } catch (err) {
        throw new GenericError(err.message, `${actionName()}_download`);
    }
}

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

module.exports = {
    download,
    upload
};
