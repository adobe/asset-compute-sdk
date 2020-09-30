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

const detectContentType = require("./utils/type");
const { GenericError } = require('@adobe/asset-compute-commons');
const util = require('util');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const imageSize = util.promisify(require('image-size'));
const contentType = require('content-type');

const RENDITION_BASENAME = 'rendition';
const DEFAULT_MIME_TYPE = 'application/octet-stream';

const HASH_ALGORITHM = 'sha1';

// 32 kb for inlined in IO events
const EMBED_LIMIT_MAX = 32 * 1024;
// roughly 2MB total based on https://stackoverflow.com/questions/695151/data-protocol-url-size-limitationsrenditions
const DATA_URI_LIMIT = 2 * 1024 * 1024 - 100;

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
        this.index = index;
        this.target = instructions.target;

        // content type handling
        this._mime = null;
        this._encoding = null;
    }

    // private helper to avoid repetitions
    async _detectContentType() {
        if (this.exists() && this.size() > 0) {
            const type = await detectContentType(this.path);
            this._mime = type.mime;
            this._encoding = type.encoding;
        }
    }

    /**
     * Function to return a file name that should be safe for all workers.
     * Respect the format if specified just in case the proper extension is needed
     */
    static renditionFilename(extension, index = 0) {
        if (extension) {
            return `${RENDITION_BASENAME}${index}.${extension}`;
        } else {
            return `${RENDITION_BASENAME}${index}`;
        }
    }

    get name() {
        return Rendition.renditionFilename(this.instructions.fmt, this.index);
    }

    get path() {
        return this._path || path.join(this.directory, this.name);
    }

    /** only for unit tests */
    set path(path) {
        this._path = path;
    }

    /**
     * Gets the file size of the rendition (in bytes)
     */
    size() {
        return fs.statSync(this.path).size;
    }

    /**
     * Computes the SHA1 hash for the rendition
     */
    async sha1() {
        if (!this._sha1) {
            this._sha1 = await fileHash(this.path, HASH_ALGORITHM);
        }
        return this._sha1;
    }

    /**
     * Checks if a rendition exists (rendition path existence)
     */
    exists() { // see and read the file
        return fs.existsSync(this.path);
    }

    /**
     * Set content type (mime type, encoding and boundary).
     * Does not do validity check regarding entered values here.
     */
    async setContentType(mime, encoding) {
        this._mime = mime;
        this._encoding = encoding;
    }

    /**
     * Returns just the mimetype
     */
    async mimeType() {
        if (!this._mime) {
            await this._detectContentType();
        }
        return this._mime;
    }

    /**
     * Returns just the encoding
     */
    async encoding() {
        if (!this._mime) {
            await this._detectContentType();
        }

        if (this._encoding === "binary") {
            return null;
        }
        return this._encoding;
    }

    /**
     * Returns a valid contenttype (validation by content-type library):
     *      - plain mimetype for binary files
     *      - mime-type + encoding for other (encoding for txt files)
     */
    async contentType() {
        const encoding = await this.encoding();
        const mimetype = await this.mimeType() || DEFAULT_MIME_TYPE;

        const contentTypeObj = {};
        contentTypeObj.type = mimetype;
        contentTypeObj.parameters = {};

        if (encoding) {
            contentTypeObj.parameters.charset = encoding;
        }

        return contentType.format(contentTypeObj);
    }

    id() {
        return this.instructions.name || this.index;
    }

    /**
     * Returns an object containing metadata of the rendition
     */
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
            const dimensions = await imageSize(this.path);
            meta[Metadata.TIFF_IMAGEWIDTH] = dimensions.width;
            meta[Metadata.TIFF_IMAGEHEIGHT] = dimensions.height;
        } catch (err) {
            // The rendition may or may not be an image, so log error for informational purposes
            // If the error is unsupported file type that's fine, but otherwise rethrow
            console.log(`no dimensions found:`, err.message || err);
        }

        try {
            meta[Metadata.DC_FORMAT] = await this.mimeType() || DEFAULT_MIME_TYPE;
        } catch (ignore) { // eslint-disable-line no-unused-vars
            // on error, use default content mimetype
            console.log("could not determine mimetype (falling back to default):", DEFAULT_MIME_TYPE);
            meta[Metadata.DC_FORMAT] = DEFAULT_MIME_TYPE;
        }

        try {
            const encoding = await this.encoding();
            if (encoding) {
                meta[Metadata.ENCODING] = encoding;
            }
        } catch (ignore) { // eslint-disable-line no-unused-vars
            console.log("could not determine encoding/charset");
        }

        return meta;
    }

    changeInstructions(newInstructions) {
        this._originalInstructions = this.instructions;
        this.instructions = newInstructions;
    }

    get originalInstructions() {
        return this._originalInstructions || this.instructions;
    }

    /**
     * Prepares `instructions` to be added into an event.
     * Redacts URL properties.
     */
    instructionsForEvent() {
        return Rendition.redactInstructions(this.originalInstructions);
    }

    static redactInstructions(instructions) {
        const obj = { ...instructions };
        // remove target URLs, could be sensitive
        delete obj.target;
        delete obj.userData;
        return obj;
    }

    shouldEmbedInIOEvent() {
        return Number.isInteger(this.instructions.embedBinaryLimit)
            && this.instructions.embedBinaryLimit <= EMBED_LIMIT_MAX
            && this.size() <= this.instructions.embedBinaryLimit;
    }

    async asDataUri() {
        // should never happen as embedBinaryLimit is limited, but extra safeguard against reading large files
        if (this.size() > DATA_URI_LIMIT) {
            throw new GenericError(`Rendition too large for data uri ${this.name}`);
        }
        const data = fs.readFileSync(this.path);

        // cannot have spaces in data uri
        // convert 'text/plain; charset=utf-8' into 'text/plain;charset=utf-8'
        const type = (await this.contentType()).replace(" ", "");

        return `data:${type};base64,${data.toString("base64")}`;
    }

    static forEach(renditions, outDirectory) {
        return renditions.map((instructions, index) => {
            return new Rendition(instructions, outDirectory, index);
        });
    }
}

module.exports = Rendition;
