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

const mime = require('mime-types');
const path = require('path');
const validUrl = require('valid-url');
const url = require('url');

const SOURCE_BASENAME = 'source';

class Source {
    constructor(paramsSource, directory="") {
        if (typeof paramsSource === "string") {
            // file path given
            this.name = paramsSource;
        } else {
            // source object with url given
            this.name = sourceFilename(paramsSource);
        }
        this.path = path.join(directory, this.name);
        this.type = paramsSource.type; // storage type
        this.url = paramsSource.url;
    }
}

// function to return an extension for a file
// if not empty returns a leading period
// prefers extension from the file over name determined by mimeType
function extension(filename, mimeType) {
    let ext = '';
    if (filename) {
        ext = path.extname(filename);
    }
    if (!ext && mimeType) {
        const mimeExt = mime.extension(mimeType);
        ext = mimeExt ? `.${mimeExt}` : '';
    }
    return ext;
}

// There is at least one worker (graphics magick) that in some cases depends
// upon the file extension so it is best to try to use the appropriate one
// based on the filename, url, or mimetype
function sourceFilename(source) {
    if (source.name) {
        return `${SOURCE_BASENAME}${extension(source.name, source.mimeType)}`;
    }

    if (source.url && validUrl.isUri(source.url)) {
        const basename = path.basename(url.parse(source.url).pathname);
        return  `${SOURCE_BASENAME}${extension(basename, source.mimeType)}`;
    }

    return `${SOURCE_BASENAME}${extension(null, source.mimeType)}`;
}

module.exports = Source;
