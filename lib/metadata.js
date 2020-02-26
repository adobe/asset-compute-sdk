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
