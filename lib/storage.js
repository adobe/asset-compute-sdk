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
        // local file support for `nui test-worker` unit tests
        // not supported for clients in production
        if (!isValidLocalFile(paramsSource.url, inDirectory)) {
            throw new Error(`Invalid or missing local file ${paramsSource.url}`);
        }
        return new Source(paramsSource.url, inDirectory);

    } else {
        const source = new Source(paramsSource, inDirectory);
        if (disableSourceDownload) {
            console.log(`Skipping source file download for ${paramsSource.url}`);

        } else {
            // TODO: logging
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
        // do nothing
    } else {
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition
}