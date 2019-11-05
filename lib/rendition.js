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
const imageSize = require('image-size');

const RENDITION_BASENAME = 'rendition';

class Rendition {
    constructor(instructions, directory, index=0){
        this.instructions = instructions; // e.g. quality, dpi, format etc
        this.directory = directory;
        // TODO: rename to name and path like in Source
        this.name = this.renditionFilename(instructions.fmt, index); // only base name
        this.path = `${this.directory}/${this.name}`; // is actually the full path
        this.index = index;
        this.target = instructions.target;
    }

    // Function to return a file name that should be safe for all workers.
    // Respect the format if specified just in case the proper extension is needed
    renditionFilename(extension, index) {
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

    id() {
        return this.instructions.name || this.index;
    }

    instructionsForEvent() {
        const obj = Object.assign({}, this.instructions);
        // remove target URLs, could be sensitive
        delete obj.target;
        return obj;
    }

    metadata() {
        const metadata = {};
        metadata['repo:size'] = this.size();
        try {
            const dimensions = imageSize(this.path);
            metadata['tiff:imageWidth'] = dimensions.width;
            metadata['tiff:imageHeight'] = dimensions.height;

        } catch (err) {
            // The rendition may or may not be an image, so log error for informational purposes
            console.log(`No dimensions found for file ${this.path}`, err.message || err);
        }
        return metadata;
    }

    static forEach(renditions, outDirectory) {
        return renditions.map( (instructions, index) => {
            return new Rendition(instructions, outDirectory, index);
        });
    }
}


module.exports = Rendition;