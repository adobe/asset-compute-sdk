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

const gm = require('gm').subClass({ imageMagick: true });
const fs = require('fs-extra');

class ImageOperations {
    constructor(infile) {
        this.img = gm(`${infile}`);
        this.path = infile;
    }

    resize(width, height) {

        this.img.define('png:exclude-chunks=date');
        this.img.resize(width, height);
    }

    write(destination) {
        return new Promise((resolve, reject) => {

            this.img.write(destination, (err) => {
                if (err || !fs.pathExistsSync(destination)) {
                    reject(Error(`Failed to convert ${this.path} to ${destination}: ${err}`));
                }
                resolve(true);
            });
        });
    }
}



module.exports = {
    ImageOperations
};
