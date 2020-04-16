/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

'use strict';

const fs = require('fs');
const crypto = require('crypto');
const imageSize = require('image-size');

const RenditionMetadata = {
    REPO_SIZE: 'repo:size',
    REPO_SHA1: 'repo:sha1',
    TIFF_IMAGEWIDTH: 'tiff:imageWidth',
    TIFF_IMAGEHEIGHT: 'tiff:imageHeight'
};


/**
 * @typedef {Object} RenditionMetadata
 * @property {Number} [repo:size] Size of the rendition
 * @property {String} [repo:sha1] SHA1 has of the rendition
 * @property {Number} [tiff:imageWidth] Width of the image rendition
 * @property {Number} [tiff:imageHeight] Height of the image rendition
 */

/**
 * Create metadata from a given file
 * 
 * @param {String} path Path to the file
 * @returns {RenditionMetadata} Acquired metadata from the file
 */
async function readMetadataFromFile(path) {
    const metadata = {};

    try {
        const stat = await fs.promises.stat(path);
        metadata[RenditionMetadata.REPO_SIZE] = stat.size;
        metadata[RenditionMetadata.REPO_SHA1] = await fileHash(path);
    } catch (err) {
        console.log(`could not determine file size and sha1:`, err.message || err);
    }

    try {
        const dimensions = imageSize(path);
        metadata[RenditionMetadata.TIFF_IMAGEWIDTH] = dimensions.width;
        metadata[RenditionMetadata.TIFF_IMAGEHEIGHT] = dimensions.height;
    } catch (err) {
        // The rendition may or may not be an image, so log error for informational purposes
        // If the error is unsupported file type that's fine, but otherwise rethrow
        console.log(`no dimensions found:`, err.message || err);
    }

    return metadata;
}

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

module.exports = {
    readMetadataFromFile,
    RenditionMetadata
}
