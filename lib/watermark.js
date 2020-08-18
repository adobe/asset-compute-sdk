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
const { RenditionFormatUnsupportedError } = require('@adobe/asset-compute-commons');


const ASSET_BASENAME = 'watermark';

class Watermark {
    constructor(params, directory="") {

        if (params.watermarkContent && validUrl.isUri(params.watermarkContent)) {
            const basename = path.basename(url.parse(params.watermarkContent).pathname);
            this.name = `${ASSET_BASENAME}${path.extname(basename)}`;
            this.url = params.watermarkContent;

        } else {
            this.name = params;
        }

        this.path = path.join(directory, this.name);
    }
}

module.exports = Watermark;
