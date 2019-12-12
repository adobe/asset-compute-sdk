/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 *  NOTICE:  All information contained herein is, and remains
 *  the property of Adobe Systems Incorporated and its suppliers,
 *  if any.  The intellectual and technical concepts contained
 *  herein are proprietary to Adobe Systems Incorporated and its
 *  suppliers and are protected by trade secret or copyright law.
 *  Dissemination of this information or reproduction of this material
 *  is strictly forbidden unless prior written permission is obtained
 *  from Adobe Systems Incorporated.
 */

'use strict';

const { GenericError, SourceUnsupportedError, SourceCorruptError } = require('@nui/asset-compute-commons');
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
}


module.exports = {
    validateParameters,
    validateRendition
}