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

const path = require('path');
const fs = require('fs-extra');

function getLocalFileDownload(params, context) {
    const source = params.source;

    let isLocalFile = false;
    if (!source.url.startsWith("/")) {
        context.infile = path.resolve("/in", source.url);
        isLocalFile = fs.existsSync(context.infile);
    }

    if (isLocalFile) {
        console.log("using local file:", context.infile);
        context.isLocalFile = true;
        return Promise.resolve(context);
    } 

    console.error("source is not an url: ", source.url);
    return Promise.reject(`source is not an url: ${source.url}`);
}

function getLocalFileUpload(params, result) {
    // nothing to upload for local files
    return Promise.resolve(result);
}

module.exports = {
    /** Return a promise for downloading the original file(s). */
    download: getLocalFileDownload,
    /** Return a promise for uploading the rendition(s). */
    upload: getLocalFileUpload
};