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
const Source = require('../lib/source');

describe("watermark.js", () => {

    it('verifies name with watermark a url', function() {
        const watermark = { };
        watermark.watermarkContent = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(new Source(watermark, './', "watermark").name, `watermark.jpg`);
        watermark.watermarkContent = 'http://server.name/directory/file%20.png?query';
        assert.strictEqual(new Source(watermark, './', "watermark").name, `watermark.png`);
        watermark.watermarkContent = 'http://server.name/directory/file%20.png?';
        assert.strictEqual(new Source(watermark, './', "watermark").name, `watermark.png`);
        watermark.watermarkContent = 'xxx://server.name/directory/file.png?query';
        assert.strictEqual(new Source(watermark, './', "watermark").name, `watermark.png`);
        watermark.watermarkContent = 'NotAUrl';
        assert.strictEqual(new Source(watermark, './', "watermark").name, 'watermark');
        watermark.watermarkContent = '';
        assert.strictEqual(new Source(watermark, './', "watermark").name, 'watermark');
    });
    it('verifies name with empty watermark object', function() {
        assert.strictEqual(new Source({}, './', "watermark").name, 'watermark');
    });
});
