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

const { GenericError, SourceUnsupportedError, SourceCorruptError, RenditionFormatUnsupportedError } = require('@adobe/asset-compute-commons');
const { actionName } = require('./action');
const { isHttpsUri } = require('valid-url');
const validDataUrl = require('valid-data-url');

function validateParameters(params){
    const validateLocation = `${actionName()}_validate`;

    // source is optional
    if (params.source !== undefined && params.source !== null) {
        if (typeof params.source === 'string') {
            params.source = { url: params.source };
        }

        if (!process.env.WORKER_TEST_MODE) {
            if (params.source.url.startsWith('data:')) {
                if (!validDataUrl(params.source.url)) {
                    throw new SourceCorruptError(`Invalid or missing data url ${params.source.url}`);
                }
            } else if ((!isHttpsUri(params.source.url))) {
                throw new SourceUnsupportedError(`Invalid or missing https url ${params.source.url}`);
            }
        }
    }

    if (!Array.isArray(params.renditions)) {
        throw new GenericError("'renditions' is not an array.", validateLocation);
    }

    // remove null elements from the array
    params.renditions = params.renditions.filter((rendition) => {
        return rendition !== null;
    });
    if (params.renditions.length === 0) {
        throw new GenericError("'renditions' array is empty.", validateLocation);
    }

    params.renditions.forEach((rendition, index) => { validateRendition(rendition, index, validateLocation); });
}

function validateRendition(rendition, index, location){
    if(location === null || location === undefined) location = `${actionName()}_validate`;

    rendition.target = rendition.target || rendition.url;
    if (!process.env.WORKER_TEST_MODE) {
        if (typeof rendition.target !== "string" && typeof rendition.target !== "object") {
            throw new GenericError(`rendition[${index}].target is neither a string nor an object`, location);
        }

        if (typeof rendition.target === "string") {
            if (!isHttpsUri(rendition.target)) {
                throw new GenericError(`rendition[${index}].target is not a valid https url`, location);
            }
        } else if (typeof rendition.target === "object") {
            // AEM multipart upload
            // {
            //     minPartSize: 10485760,
            //     maxPartSize: 104857600,
            //     urls: [ "https://one", "https://two", "https://three" ]
            // }
            if (rendition.target.urls) {
                for (const url of rendition.target.urls) {
                    if (!isHttpsUri(url)) {
                        throw new GenericError(`at least one of rendition[${index}].target.urls is not a valid https url`, location);
                    }
                }
            }
        }
    }

    if (rendition.watermark && rendition.watermark.watermarkContent !== undefined && rendition.watermark.watermarkContent !== null) {
        validateWatermark(rendition.watermark);
    }
}

function validateWatermark (paramsWatermark) {
    // Only validates that content is an HTTPS or data URL
    if (!process.env.WORKER_TEST_MODE) {

        if (paramsWatermark.watermarkContent.startsWith('data:')) {
            if (paramsWatermark.watermarkContent.startsWith('data:image/png') || !validDataUrl(paramsWatermark.watermarkContent)) {
                throw new RenditionFormatUnsupportedError(`Invalid or missing data url for watermark ${paramsWatermark.watermarkContent}`);
            }
        } else if ((!isHttpsUri(paramsWatermark.watermarkContent))) {
            throw new RenditionFormatUnsupportedError(`Invalid or missing https url for watermark ${paramsWatermark.watermarkContent}`);
        }
    }
}

module.exports = {
    validateParameters,
    validateRendition,
    validateWatermark
};
