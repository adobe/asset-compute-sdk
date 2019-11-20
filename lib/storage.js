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
const { actionName } = require('./action');
const path = require('path');

function isValidLocalFile(fileName, basePath){
    const fullPath = path.join(basePath, fileName);
    if ( (!fullPath.startsWith("/in")) || fullPath.endsWith("/..") || fullPath.includes("/../")) {
        return false;
    }
    return fs.existsSync(fullPath);
}

function checkUrl(urlToValidate, location="source") {
    if (urlToValidate && typeof urlToValidate === "string") {
        return !(isHttpsUri(urlToValidate) === undefined);
    }

    console.error(`Not a valid HTTPS uri in ${location}: ${urlToValidate}`);
    return false;
}

function checkRenditionUrl(renditionUrl) {
    let result = true;

    if (renditionUrl && 
        typeof renditionUrl === "object" && 
        Array.isArray(renditionUrl)) { // url array

        const urlsLength = renditionUrl.length;
        if(urlsLength === 0){
            result = false;
        }

        let i = 0;
        while(result && i < urlsLength) {
            result = checkUrl(renditionUrl[i], "rendition.target");
            i++;
        }
    } else { // single url? nothing?
        result = checkUrl(renditionUrl, "rendition.target");
    }
    
    return result;
}

async function getSource(paramsSource, inDirectory, disableSourceDownload){
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

        } else if (!checkUrl(paramsSource.url)) {
            throw new SourceUnsupportedError(`Invalid or missing https url ${paramsSource.url}`);
        } else {
            // TODO: logging
            // TODO: error handling: errors catched & thrown in http.download() and then catched again in worker.js ???
            // download http/https url into file
            await http.download(paramsSource, source.path);
        }

        return source;
    }
}

async function putRendition(rendition) {
    const target = rendition.target;
    if (process.env.WORKER_TEST_MODE) {
        // do nothing
    } else if (!checkRenditionUrl(target)) {
        const msg = `Invalid or missing https url ${(typeof target === "string") ? target:''}`;
        throw new GenericError(msg, `${actionName()}_putRendition`);
    } else {
        // checkUrl enforces that rendition urls are https
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition
}