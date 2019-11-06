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

const Source = require('./source');
const http = require('./storage/http');
const fs = require("fs-extra");
const { isHttpsUri } = require('valid-url');
const { SourceUnsupportedError, GenericError } = require('@nui/asset-compute-commons');
const { actionName } = require('./prepare');
const path = require('path');

async function getSource(paramsSource, inDirectory, disableSourceDownload){
    if (process.env.NUI_UNIT_TEST_MODE) {
        // local file support for `nui test-worker` unit tests
        // not supported for clients in production
        if (! isValidLocalFile(paramsSource.url, inDirectory)) {
            throw new Error(`Invalid or missing local file ${paramsSource.url}`);
        }
        return new Source(paramsSource.url, inDirectory);

    } else {
        const source = new Source(paramsSource, inDirectory);
        if (disableSourceDownload) {
            console.log(`Skipping source file download for ${paramsSource.url}`);

        } else if (!checkUrls(paramsSource.url)) {
            throw new SourceUnsupportedError(`Invalid or missing https url ${paramsSource.url}`);
        } else {
            // TODO: logging
            // TODO: error handling: errors catched & thrown in http.download() and then catched again in worker.js ???
            // TODO: https enforcement? https://git.corp.adobe.com/nui/asset-compute-sdk/issues/15
            // download http/https url into file
            await http.download(paramsSource, source.path);
        }

        return source;
    }
}

function isValidLocalFile(fileName, basePath){
    const fullPath = path.join(basePath, fileName);
    if (! fullPath.startsWith("/in")) {
        return false;
    }
    return fs.existsSync(fullPath);
}

function checkUrls(target) {
    if (target && typeof target === "string") {
        return isHttpsUri(target);
    }
    if (target && typeof target === "object" && Array.isArray(target.urls)) {
        for (const url of target.urls) {
            if (url && !isHttpsUri(url)) {
                console.error(`Not a valid HTTPS uri: ${url}`);
                return false;
            }
        }
        return true;
    }
    console.error(`Not a valid HTTPS uri: ${target}`);
    return false;
}

async function putRendition(rendition) {
    const target = rendition.target;
    if (process.env.NUI_UNIT_TEST_MODE) {
        // do nothing
    } else if (!checkUrls(target)) {
        const msg = `Invalid or missing https url ${(typeof target === "string") ? target:''}`;
        throw new GenericError(msg, `${actionName()}_putRendition`);
    } else {
        // TODO: https enforcement? https://git.corp.adobe.com/nui/asset-compute-sdk/issues/15
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition
}