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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const imageSize = require('image-size');

const RENDITION_BASENAME = 'rendition';

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

    size() {
        if (this._size === undefined) {
            this._size = fs.statSync(this.path).size;
        }
        return this._size;
    }

    async sha1() {
        if (this._sha1 === undefined) {
            this._sha1 = await fileHash(this.path);
        }
        return this._sha1;
    }

    id() {
        return this.instructions.name || this.index;
    }

    instructionsForEvent() {
        const obj = Object.assign({}, this.instructions);
        // remove target URLs, could be sensitive
        delete obj.target;
        return obj;
    }

    async metadata() {
        const metadata = {};
        metadata['repo:size'] = this.size();
        metadata['repo:sha1'] = await this.sha1();
        try {
            const dimensions = imageSize(this.path);
            metadata['tiff:imageWidth'] = dimensions.width;
            metadata['tiff:imageHeight'] = dimensions.height;

        } catch (err) {
            // The rendition may or may not be an image, so log error for informational purposes
            // If the error is unsupported file type that's fine, but otherwise rethrow
            console.log(`No dimensions found for file ${this.path}`, err.message || err);
            if (err.message && !err.message.includes('unsupported file type')) {
                throw err;
            }
        }
        return metadata;
    }

    static forEach(renditions, outDirectory) {
        return renditions.map( (instructions, index) => {
            return new Rendition(instructions, outDirectory, index);
        });
    }
}

function fileHash(filename, algorithm = 'sha1') {
    return new Promise((resolve, reject) => {
        const shasum = crypto.createHash(algorithm);
        try {
            const stream = new fs.createReadStream(filename);
            stream.on('data', data => shasum.update(data));
            stream.on('end', () => resolve(shasum.digest('hex')));
            stream.on('error', err => reject(err));
        } catch (error) {
            return reject(`creating ${algorithm} hash failed: ${error.message || error}`);
        }
    });
}

module.exports = Rendition;