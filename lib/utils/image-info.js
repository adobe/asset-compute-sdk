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

const fetch = require('fetch-retry');
const imageInfo = require('image-size');

class ImageInfo {
    /**
    * Return number of bytes sufficient to get image info
    * @returns {}
    *
    * @param {String} filePath - Path of the image to get its dimensions and type
    * @returns {Number} number of bytes sufficient to get image info
    */
    static bytesSufficient() { return 10000; }
    /**
     * Return width, height, type and possibly orientation of image
     *
     * @param {String} filePath - Path of the image to get its dimensions and type
     * @returns {Object} {width: image width, height: image height, type: image type
     *                    orientation: TIFF orientation; may not be present}
     */
    static getImageInfoFromFile(filePath) {
        return imageInfo(filePath);
    }

    /**
    * Return width, height, type and possibly orientation of image
    *
    * @param {String} url - Url of the image to get its dimensions and type
    * @returns {Object} {width: image width, height: image height, type: image type
    *                    orientation: TIFF orientation; may not be present}
    */
    static async getImageInfoFromUrl(url) {
        // according to documentation you don't need to download the entire image
        // a few kilobytes should do
        const response = await fetch(url, {
            headers: { 'Content-Length': this.bytesSufficient() }
        });
        if (response.ok) {
            const data = await response.buffer();
            return imageInfo(data);
        } else {
            throw new Error('failed to retrieve data from url')
        }
    }
}

module.exports = ImageInfo;
