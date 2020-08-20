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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

describe('storage.js', () => {

    describe('test', () => {

        it.only('should download simple png and return a new watermark object', async () => {

            const fs = require('fs-extra');
            const fileType = require('file-type');
            const gm = require('gm').subClass({ imageMagick: true });

            const watermark = "/Users/dhendric/working/ADOBE/asset-compute-sdk/test/files/watermark.png"
            if (fs.pathExistsSync(watermark)) {
                console.log("File exists")
            }
            console.log("IDENTIFY", gm(watermark).identify())

            gm(watermark).identify(function (err, value) {
                // note : value may be undefined
                console.log("VALUE",value)

            })

            const assetType = await fileType.fromFile(watermark);
            console.log("FFFFF", assetType)
        });
    });
});
