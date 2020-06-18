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

const fs = require('fs');
const path = require('path');
const execa = require('execa');
const crypto = require('crypto');
const imageSize = require('image-size');

const RENDITION_BASENAME = 'rendition';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const Metadata = {
    REPO_SIZE: 'repo:size',
    REPO_SHA1: 'repo:sha1',
    DC_FORMAT: 'dc:format',
    ENCODING: 'repo:encoding',
    TIFF_IMAGEWIDTH: 'tiff:imageWidth',
    TIFF_IMAGEHEIGHT: 'tiff:imageHeight'
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

    exists() { // see and read the file
        return fs.existsSync(this.path);
    }

    async mimeType() {
        let mimetype = DEFAULT_CONTENT_TYPE;

        // Long version of the command has the advantage of ensuring same results on Linux and Mac
        if(this.exists() && this.size() > 0){
            // mimetype = DEFAULT_CONTENT_TYPE; // if the file can't be red, should we return undefined?
            const commandResult = await execa('file', ['-b', '--mime-type', this.path]);
            if(commandResult.exitCode === 0){
                mimetype = commandResult.stdout;
            }
        }

        return mimetype;
    }

    async contentType() {
        return this.mimeType();
    }

    async encoding() {
        let encoding;

        if(this.exists() && this.size() > 0){
            // Long version of the command has the advantage of ensuring same results on Linux and Mac
            const commandResult = await execa('file', ['-b', '--mime-encoding', this.path]);
            if(commandResult.exitCode === 0){
                encoding = commandResult.stdout;
            }
        }
        return encoding;
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
            meta[Metadata.REPO_SHA1] = await this.sha1();
        } catch (err) {
            console.log("could not determine sha1 file hash:", err);
        }

        try {
            meta[Metadata.REPO_SIZE] = this.size();
        } catch (err) {
            console.log("could not determine file size:", err);
        }

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
            meta[Metadata.DC_FORMAT] = await this.mimeType();
        } catch (err) {
            // on error, use default content mimetype
            console.log("could not determine mimetype (falling back to default mimetype):", err);
            meta[Metadata.DC_FORMAT] = DEFAULT_CONTENT_TYPE;
        }

        try {
            const encoding = await this.encoding();
            if (encoding) {
                meta[Metadata.ENCODING] = encoding;
            }
        } catch (err) {
            console.log("could not determine encoding/charset:", err);
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
