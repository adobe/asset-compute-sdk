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

const mime = require('mime-types');
const path = require('path');
const validUrl = require('valid-url');
const url = require('url');

const SOURCE_BASENAME = 'source';

class Source {
    constructor(paramsSource, directory="", basename) {
        // optional params for watermarking
        if (paramsSource.watermarkContent) {
            this.isWatermark = true;
            this.watermarkContent = paramsSource.watermarkContent;
            this.widthPercent = paramsSource.widthPercent;
        }
        
        if (typeof paramsSource === "string") {
            // file path given
            this.name = paramsSource;
        } else {
            // source object with url given
            this.basename = basename || SOURCE_BASENAME;
            this.name = sourceFilename(paramsSource, this.basename);
        }
        this.path = path.join(directory, this.name);
        this.type = paramsSource.type; // storage type
        this.url = paramsSource.url || this.watermarkContent;

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
function sourceFilename(source, basename) {
    const sourceUrl = source.url || source.watermarkContent;
    if (source.name) {
        return `${basename}${extension(source.name, source.mimeType)}`;
    }

    if (sourceUrl && sourceUrl.startsWith("data:image/png")) {
        return `${basename}.png`;
    }

    if (sourceUrl && validUrl.isUri(sourceUrl)) {
        const name = path.basename(url.parse(sourceUrl).pathname);
        return  `${basename}${extension(name, source.mimeType)}`;
    }

    return `${basename}${extension(null, source.mimeType)}`;
}

module.exports = Source;
