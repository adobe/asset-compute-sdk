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

const fetch = require('@adobe/node-fetch-retry');
const imageInfo = require('image-size');

class ImageInfo {
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
    * @param {String} url - url of the image to get its dimensions and type
    * @param {number} bytesToRead - number of bytes to read, optional
    * @returns {Object} {width: image width, height: image height, type: image type
    *                    orientation: TIFF orientation; may not be present}
    */
    static async getImageInfoFromUrl(url, bytesToRead) {
        // according to documentation you don't need to download the entire image
        // a few kilobytes should do, however it does seem to vary from file type to type
        const options = {};
        options.retryOptions = {
            retryMaxDuration:3000,
            retryInitialDelay:1000,
            retryBackoff: 1.0
        };
        if (bytesToRead) {
            options.headers = { Range: `bytes:0-${bytesToRead}` };
        }
        const response = await fetch(url, options);
        if (response.ok) {
            const data = await response.buffer();
            return imageInfo(data);
        } else {
            throw new Error('failed to retrieve data from url');
        }
    }
}

module.exports = ImageInfo;
