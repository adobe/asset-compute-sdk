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

async function getSource(paramsSource, inDirectory, disableSourceDownload){

    if (process.env.NUI_UNIT_TEST_MODE) {
        // local file support for `nui test-worker` unit tests
        // not supported for clients in production
        if (!isValidLocalFile(paramsSource.url)) {
            throw new Error(`Invalid or missing local file: ${paramsSource.url}`);
        }
        return new Source(paramsSource.url, inDirectory);

    } else {
        const source = new Source(paramsSource, inDirectory);

        if (disableSourceDownload) {
            console.log(`Skipping source file download for ${paramsSource.url}`);

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

async function isValidLocalFile(path){
    if(path.startsWith("../") || path.includes("/../") || path.endsWith("/..")){
        return false;
    }
    return fs.existsSync(path);
}

async function putRendition(rendition) {
    if (process.env.NUI_UNIT_TEST_MODE) {
        // do nothing
    } else {
        // TODO: https enforcement? https://git.corp.adobe.com/nui/asset-compute-sdk/issues/15
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition
}