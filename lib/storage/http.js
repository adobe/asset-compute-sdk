/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2018 Adobe Systems Incorporated
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

const http = require('@nui/node-httptransfer');
const { GenericError, RenditionTooLarge } = require('@nui/asset-compute-commons');
const { actionName } = require('../action');
const mime = require('mime-types');


async function download(source, file) {
    try {
        const contentType = mime.contentType(source.name)  || 'application/octet-stream';
        console.log(`downloading source: ${source.url} into ${file}`);
        await http.downloadFile(source.url, file, {
            retryEnabled: !process.env.NUI_DISABLE_RETRIES,
            headers: {
                'content-type': contentType
            }
        });
        console.log(`download finished successfully`);

    } catch (err) {
        throw new GenericError(err.message, `${actionName()}_download`);
    }
}

async function upload(rendition) {
    const file = rendition.path;
    const target = rendition.target;
    const contentType = mime.contentType(rendition.name) || 'application/octet-stream';
    console.log(mime.contentType(file));
    if (!target) {
        console.warn(`rendition ${rendition.id()} does not have a target`);
        return;
    }

    if (!file) {
        console.warn(`rendition ${rendition.id()} does not have a file path`);
        return;
    }

    try {
        if (typeof target === 'string') {
            console.log(`uploading rendition ${file} to ${target}`);
            await http.uploadFile(file, target, {
                retryEnabled: !process.env.NUI_DISABLE_RETRIES,
                headers: {
                    'content-type': contentType
                }
            });
            console.log(`successfully finished uploading rendition`);

        } else if (typeof target === 'object' && Array.isArray(target.urls)) {
            console.log(`uploading rendition ${file} as multi-part to ${target.urls[0]} and ${target.urls.length-1} more urls`);
            await http.uploadAEMMultipartFile(file, target, {
                retryEnabled: !process.env.NUI_DISABLE_RETRIES,
                headers: {
                    'Content-Type': contentType
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
