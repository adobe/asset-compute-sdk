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

const path = require('path');
const validUrl = require('valid-url');
const url = require('url');

const ASSET_BASENAME = 'watermark';

class Watermark {
    constructor(params, directory="") {

        this.name = getName(params.watermarkContent);
        this.path = path.join(directory, this.name);
        this.watermarkContent = params.watermarkContent || undefined;
        this.widthPercent = params.widthPercent;

        if (this.watermarkContent && validUrl.isUri(this.watermarkContent)) {
            this.url = this.watermarkContent;
        }
    }
}

function getName(watermarkContent) {

    let name;
    if (watermarkContent && validUrl.isUri(watermarkContent)) {
        
        if (watermarkContent.startsWith("data:image/png")) {
            name = `${ASSET_BASENAME}.png`;
        } else {
            name = path.basename(url.parse(watermarkContent).pathname);
        }
    } else if (typeof watermarkContent === "string") {
        // name = path.basename(params);
        name = path.basename(watermarkContent);
    } else {
        name = ASSET_BASENAME;
    }
    console.log('`${ASSET_BASENAME}${path.extname(name)}`', `${ASSET_BASENAME}${path.extname(name)}`);

    return `${ASSET_BASENAME}${path.extname(name)}`;
}

module.exports = Watermark;
