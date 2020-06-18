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

const assert = require('assert');
const Rendition = require('../lib/rendition.js');

// WARNING: filesystem is not mocked here, so content-type identification can be tested with known files.

describe("rendition.js", () => {
    it('detects mimetype of an existing an accessible file', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);

        // overwrite path to point to test files
        rendition.path = './test/files/file.bmp';
        let result = await rendition.mimeType();
        assert.ok(result === 'image/x-ms-bmp');

        rendition.path = './test/files/file with spaces in name.bmp';
        result = await rendition.mimeType();
        assert.ok(result === 'image/x-ms-bmp');

        rendition.path = './test/files/negative/1pixel.png';
        result = await rendition.mimeType();
        assert.ok(result === 'image/png');

        rendition.path = './test/files/negative/1pixel-masquerade.png';
        result = await rendition.contentType();
        assert.ok(result === 'image/webp');

        rendition.path = './test/files/negative/file-webp-masquerading-as-png.png';
        result = await rendition.mimeType();
        assert.ok(result === 'image/webp');

        rendition.path = './test/files/negative/png-masquerading-as-jpg.jpg';
        result = await rendition.contentType();
        assert.ok(result === 'image/png');
    });
});
