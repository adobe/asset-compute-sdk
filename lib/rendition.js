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

const util = require('util');

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const imageSize = util.promisify(require('image-size'));
const contentType = require('content-type');
const FileType = require('file-type');

const exec = util.promisify(require('child_process').exec);

const RENDITION_BASENAME = 'rendition';
const DEFAULT_MIME_TYPE = 'application/octet-stream';

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

async function getContentTypeInformation(rendition) {
    let encoding;

    // assumes rendition exists and size > 0 (to be checked in caller)
    const { stdout } = await exec(`file -b --mime "${rendition.path}"`);
    const mimetype = stdout.trim();

    // parsing will throw if `file` command did not return a valid content type
    const parsedContentType = contentType.parse(mimetype);
    const mime = parsedContentType.type || DEFAULT_MIME_TYPE;

    if (parsedContentType.parameters && parsedContentType.parameters.charset) {
        encoding = parsedContentType.parameters.charset;
    }

    return { mime: mime, encoding: encoding };
}

async function detectContentType(rendition) {
    let localMimeType;
    let localEncoding;

    try { // `file` command
        // assumes rendition exists and size > 0 (to be checked in caller)
        const fileCmdResult = await getContentTypeInformation(rendition);
        localMimeType = fileCmdResult.mime;
        localEncoding = fileCmdResult.encoding;
    } catch (err) { // fallback to using `file-type lib` (won't set encoding)
        console.log('`file` command failed', err); // err should be empty
        console.log('Trying to find mimetype based on rendition file analysis (magic numbers)');
        const filetypeInfo = await FileType.fromFile(rendition.path);
        if (filetypeInfo) { // only defined if something could be identified
            localMimeType = filetypeInfo.mime;
        }
    }

    return {
        mime: localMimeType || DEFAULT_MIME_TYPE,
        encoding: localEncoding
    };
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
        this._mime = null;
        this._encoding = null;
        /*
        // no multipart rendition supported currently
        this._boundary = null;
        //*/
    }

    // private helper to avoid repetitions
    async _detectContentType() {
        if (this.exists() && this.size() > 0) {
            const contentType = await detectContentType(this);
            this._mime = contentType.mime;
            this._encoding = contentType.encoding;
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
    async setContentType(mime, encoding, boundary = null) {
        this._mime = mime;
        this._encoding = encoding;

        if (mime.includes("multipart")) { // for multipart only, e.g. multipart/form-data; boundary=something
            this._boundary = boundary;
        }
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

        /*
        // no multipart rendition supported currently
        if (this._boundary) {
            contentTypeObj.parameters.boundary = this._boundary;
        }
        //*/

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

    /**
     * Prepares `instructions` to be added into an event.
     * Redacts URL properties.
     */
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
