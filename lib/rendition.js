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

const { GenericError } = require('@adobe/asset-compute-commons');
const path = require('path');
const fs = require("fs");
const mime = require('mime-types');
const crypto = require('crypto');
const imageSize = require('image-size');

const RENDITION_BASENAME = 'rendition';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

// 32 kb for inlined in IO events
const INLINE_LIMIT_MAX = 32 * 1024;
// roughly 2MB total based on https://stackoverflow.com/questions/695151/data-protocol-url-size-limitationsrenditions
const DATA_URI_LIMIT = 2 * 1024 * 1024 - 100;

const Metadata = {
    REPO_SIZE: 'repo:size',
    REPO_SHA1: 'repo:sha1',
    TIFF_IMAGEWIDTH: 'tiff:imageWidth',
    TIFF_IMAGEHEIGHT: 'tiff:imageHeight',
    DC_FORMAT: 'dc:format',
    // no standardized field in xdm yet
    ENCODING: 'repo:encoding'
};

function fileHash(filename, algorithm = 'sha1') {
    return new Promise((resolve, reject) => {
        const shasum = crypto.createHash(algorithm);
        try {
            const stream = fs.createReadStream(filename);
            stream.on('data', data => shasum.update(data));
            stream.on('end', () => resolve(shasum.digest('hex')));
            stream.on('error', err => reject(err));
        } catch (error) {
            return reject(`creating ${algorithm} hash failed: ${error.message || error}`);
        }
    });
}

/**
 * Rendition abstraction
 */
class Rendition {
    constructor(instructions, directory, index=0){
        this.instructions = instructions; // e.g. quality, dpi, format etc
        this.directory = directory;
        this.name = Rendition.renditionFilename(instructions.fmt, index); // only base name
        this.path = path.join(this.directory, this.name);
        this.index = index;
        this.target = instructions.target;
    }

    // Function to return a file name that should be safe for all workers.
    // Respect the format if specified just in case the proper extension is needed
    static renditionFilename(extension, index=0) {
        if (extension) {
            return `${RENDITION_BASENAME}${index}.${extension}`;
        } else {
            return `${RENDITION_BASENAME}${index}`;
        }
    }

    exists() {
        return fs.existsSync(this.path);
    }

    size() {
        return fs.statSync(this.path).size;
    }

    async sha1() {
        if (!this._sha1) {
            this._sha1 = await fileHash(this.path, "sha1");
        }
        return this._sha1;
    }

    mimeType() {
        // TODO: mimetype should be set by worker (this only looks at extension)
        return mime.lookup(path.extname(this.path)) || DEFAULT_CONTENT_TYPE;
    }

    charset() {
        // TODO: charset should be set by worker or determined by actually looking at the file
        return mime.charset(path.extname(this.path));
    }

    contentType() {
        // TODO: mimetype should be set by worker (this only looks at extension)
        return mime.contentType(path.extname(this.path)) || DEFAULT_CONTENT_TYPE;
    }

    async metadata() {
        if (!this.exists()) {
            return {};
        }

        const meta = {};

        try {
            const dimensions = imageSize(this.path);
            meta[Metadata.TIFF_IMAGEWIDTH] = dimensions.width;
            meta[Metadata.TIFF_IMAGEHEIGHT] = dimensions.height;
        } catch (err) {
            // The rendition may or may not be an image, so log error for informational purposes
            // If the error is unsupported file type that's fine, but otherwise rethrow
            console.log(`no dimensions found:`, err.message || err);
        }

        try {
            meta[Metadata.REPO_SIZE] = this.size();
        } catch (err) {
            console.log("could not determine file size:", err);
        }

        try {
            meta[Metadata.REPO_SHA1] = await this.sha1();
        } catch (err) {
            console.log("could not determine sha1 file hash:", err);
        }

        // TODO: enable mime type and charset, e.g. CQ-4293182
        // meta[Metadata.DC_FORMAT] = this.mimeType();

        // const charset = this.charset();
        // if (charset) {
        //     meta[Metadata.ENCODING] = charset;
        // }

        return meta;
    }

    id() {
        return this.instructions.name || this.index;
    }

    instructionsForEvent() {
        const obj = { ...this.instructions };
        // remove target URLs, could be sensitive
        delete obj.target;
        return obj;
    }

    inline() {
        return Number.isInteger(this.instructions.inlineLimit)
            && this.instructions.inlineLimit <= INLINE_LIMIT_MAX
            && this.size() <= this.instructions.inlineLimit;
    }

    asDataUri() {
        // should never happen as inlineLimit is limited, but extra safeguard against reading large files
        if (this.size() > DATA_URI_LIMIT) {
            throw new GenericError(`Rendition too large for data uri ${this.name}`);
        }
        const data = fs.readFileSync(this.path);

        // cannot have spaces in data uri
        // convert 'text/plain; charset=utf-8' into 'text/plain;charset=utf-8'
        const type = this.contentType().replace(" ", "");

        return `data:${type};base64,${data.toString("base64")}`;
    }

    static forEach(renditions, outDirectory) {
        return renditions.map( (instructions, index) => {
            return new Rendition(instructions, outDirectory, index);
        });
    }
}

module.exports = Rendition;
