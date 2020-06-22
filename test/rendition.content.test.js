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

describe("rendition.js - content types", () => {
    it.only('detects mimetype of an existing an accessible file', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);

        // overwrite path to point to test files
        rendition.path = './test/files/file.bmp';
        let result = await rendition.mimeType();
        assert.strictEqual(result, 'image/x-ms-bmp');

        rendition.path = './test/files/file.tif';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'image/tiff');

        rendition.path = './test/files/file with spaces in name.txt';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'image/x-ms-bmp');

        rendition.path = './test/files/negative/1pixel.png';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'image/png');

        rendition.path = './test/files/negative/1pixel-masquerade.png';
        result = await rendition.contentType();
        assert.strictEqual(result, 'image/webp');

        rendition.path = './test/files/negative/file-webp-masquerading-as-png.png';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'image/webp');

        rendition.path = './test/files/negative/png-masquerading-as-jpg.jpg';
        result = await rendition.contentType();
        assert.strictEqual(result, 'image/png');
    });

    it('gracefully handles not finding files when identifying mimetype', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);

        // overwrite path to point to test files
        rendition.path = './test/files/file-that-does-not-exist-and-should-therefore-not-be-here.bmp';
        let result = await rendition.mimeType();
        assert.strictEqual(result, 'application/octet-stream');

        rendition.path = '';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'application/octet-stream');

        rendition.path = '  ';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'application/octet-stream');

        rendition.path = '\n\n';
        result = await rendition.mimeType();
        assert.strictEqual(result, 'application/octet-stream');
    });

    it('detects encoding of an existing an accessible file', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);

        // overwrite path to point to test files
        rendition.path = './test/files/file.tif';
        let result = await rendition.encoding();
        assert.ok(result === null);
        
        rendition.path = './test/files/file.txt';
        result = await rendition.charset();
        assert.strictEqual(result, 'us-ascii');
    });

    it('gracefully handles not finding files when identifying encoding', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);

        // overwrite path to point to test files
        rendition.path = './test/files/file-that-does-not-exist-and-should-therefore-not-be-here.bmp';
        let result = await rendition.encoding();
        assert.ok(result === null);

        rendition.path = '';
        result = await rendition.encoding();
        assert.ok(result === null);

        rendition.path = '  ';
        result = await rendition.encoding();
        assert.ok(result === null);

        rendition.path = '\n\n';
        result = await rendition.encoding();
        assert.ok(result === null);
    });

    it('verifies metadata works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.path = './test/files/file.jpg';
        const metadata = await rendition.metadata();

        // test field by field
        assert.strictEqual(metadata["repo:size"], 109472);
        assert.strictEqual(metadata["repo:sha1"], "8b7ce94860836844eb17de009586fad2ca2fc8ad");
        assert.strictEqual(metadata["tiff:imageWidth"], 512);
        assert.strictEqual(metadata["tiff:imageHeight"], 288);
        assert.strictEqual(metadata["dc:format"], "image/jpeg");
        assert.ok(metadata["repo:encoding"] === null);
    });
});
