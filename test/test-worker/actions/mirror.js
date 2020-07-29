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

const { worker } = require('../../../lib/api');
const dataUriToBuffer = require('data-uri-to-buffer');
const fs = require('fs').promises;

exports.main = worker(async (source, rendition) => {
    const dataUri = rendition.instructions.data || "data:text/plain;charset=utf-8;,hello";
    const data = dataUriToBuffer(dataUri);

    const type    = rendition.instructions["dc:format"]     || data.type;
    const charset = rendition.instructions["repo:encoding"] || data.charset;

    await fs.writeFile(rendition.path, data);
    rendition.setContentType(type, charset);
}, {
    disableSourceDownload: true
});