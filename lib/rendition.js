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

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const imageSize = require('image-size');

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const RENDITION_BASENAME = 'rendition';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

const HASH_ALGORITHM = 'sha1';

const Metadata = {
    REPO_SIZE: 'repo:size',
    REPO_SHA1: 'repo:sha1',
    DC_FORMAT: 'dc:format',
    ENCODING: 'repo:encoding',
    TIFF_IMAGEWIDTH: 'tiff:imageWidth',
    TIFF_IMAGEHEIGHT: 'tiff:imageHeight'
};

function fileHash(filename, algorithm) {
    return new Promise((resolve, reject) => {
        try {
            const shasum = crypto.createHash(algorithm);
        
            const stream = fs.createReadStream(filename);
            stream.on('data', data => shasum.update(data));
            stream.on('end', () => resolve(shasum.digest('hex')));
            stream.on('error', err => {
                reject(`creating ${algorithm} hash failed: ${err.message || err}`);
            });
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

        // content type handling
        this._mime = DEFAULT_CONTENT_TYPE;
        this._encoding = null;
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
            this._sha1 = await fileHash(this.path, HASH_ALGORITHM);
        }
        return this._sha1;
    }

    exists() { // see and read the file
        return fs.existsSync(this.path);
    }

    async _getMimeInformationFromCommand(){
        if(this.exists() && this.size() > 0){
            const {stdout} = await exec('file', ['-b', '--mime', this.path]);
            mimetype = stdout.trim();

            let mimeInfo = mimetype.split("; ");
            this.mimeType = mimeInfo[0];
            this.encoding = mimeInfo[1];
        }
    }

    async _getMimeInformationFromMimeFIle(){
        
    }

    /**
     * Returns just the mimetype
     */
    get mimeType() {
        return this._mime;
    }

    /**
     * Sets just the mimetype
     */
    set mimeType(path, mime=null) {
        if(mime) { // if mime is explicitly set, use it
            this._mime = mime;
        } else if(path) { // try to parse mime.txt file

        }
    }

    /**
     * Returns just the encoding
     */
    get encoding() {
        if(this._encoding === "binary"){
            return null;
        }
        return this._encoding;
    }

    /**
     * Sets just the encoding
     */
    set encoding(path, encoding=null) {
        if(encoding){ // if encoding is explicitly set, use it
            this._encoding = encoding;
        } else if(path) { // try to parse mime.txt file

        }
    }

    /**
     * Returns a valid contenttype:
     *      - plain mimetype for binary files
     *      - mime-type + encoding for other (encoding for txt files)
     */
    get contentType() {
        let contentType = null;

        let encoding = this.encoding();
        if(encoding){
            contentType = `${this.mimeType()}; ${encoding}`; 
        } else {
            contentType = this.mimeType();
        }

        return contentType;
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
