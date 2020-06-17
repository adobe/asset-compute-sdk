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

const path = require('path');
const util = require('util');
const fs = require('fs');
const crypto = require('crypto');

const mmm = require('mmmagic'),
    Magic = mmm.Magic;


const RENDITION_BASENAME = 'rendition';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const Metadata = {
    REPO_SIZE: 'repo:size',
    REPO_SHA1: 'repo:sha1',
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
    constructor(instructions, directory, index = 0) {
        this.instructions = instructions; // e.g. quality, dpi, format etc
        this.directory = directory;
        this.name = Rendition.renditionFilename(instructions.fmt, index); // only base name
        this.path = path.join(this.directory, this.name);
        this.index = index;
        this.target = instructions.target;

        // promisifying objects methods needs more lines of code than simple functions
        const mimeTypeMagic = new Magic(mmm.MAGIC_MIME_TYPE);
        const naiveMimeTypeDetector = util.promisify(mimeTypeMagic.detectFile);
        this.mimeTypeDetector = naiveMimeTypeDetector.bind(mimeTypeMagic);
    }

    // Function to return a file name that should be safe for all workers.
    // Respect the format if specified just in case the proper extension is needed
    static renditionFilename(extension, index = 0) {
        if (extension) {
            return `${RENDITION_BASENAME}${index}.${extension}`;
        } else {
            return `${RENDITION_BASENAME}${index}`;
        }
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

    async mimeType() {
        const mimeType = await this.mimeTypeDetector(this.path);

        // in case no mimeType is recognized, used default
        return mimeType || DEFAULT_CONTENT_TYPE;
    }

    async contentType() {
        return this.mimeType();
    }

    async charset() {
        return '#CHARSET-TO-DO';
    }

    id() {
        return this.instructions.name || this.index;
    }

    async metadata() {
        if (!this.exists()) {
            return {};
        }

        const meta = {};

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
        try {
            meta[Metadata.DC_FORMAT] = await this.mimeType();
        } catch (err) {
            // on error, use default content mimetype
            console.log("could not determine mimetype (falling back to default mimetype):", err);
            meta[Metadata.DC_FORMAT] = DEFAULT_CONTENT_TYPE;
        }

        try {
            const charset = await this.charset();
            if (charset) {
                meta[Metadata.ENCODING] = charset;
            }
        } catch (err) {
            console.log("could not determine charset:", err);
        }

        return meta;
    }

    instructionsForEvent() {
        const obj = { ...this.instructions };
        // remove target URLs, could be sensitive
        delete obj.target;
        return obj;
    }

    static forEach(renditions, outDirectory) {
        return renditions.map((instructions, index) => {
            return new Rendition(instructions, outDirectory, index);
        });
    }
}

module.exports = Rendition;
