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

const detectContentType = require('../lib/utils/type');
const assert = require('assert');
const mockRequire = require("mock-require");

describe("type.js", () => {
    it('detects mimetypes and encodings', async function () {
        const result = await detectContentType('./test/files/file.bmp');
        assert.ok(result.mime === 'image/bmp' || result.mime === 'image/x-ms-bmp');
        assert.ok(result.encoding === 'binary');

        assert.deepStrictEqual(await detectContentType('./test/files/file.tif'), {
            mime: 'image/tiff',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/file with spaces in name.txt'), {
            mime: 'application/octet-stream',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/negative/1pixel.png'), {
            mime: 'image/png',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/negative/1pixel-masquerade.png'), {
            mime: 'image/webp',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/negative/file-webp-masquerading-as-png.png'), {
            mime: 'image/webp',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/negative/png-masquerading-as-jpg.jpg'), {
            mime: 'image/png',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/file.tif'), {
            mime: 'image/tiff',
            encoding: "binary"
        });

        assert.deepStrictEqual(await detectContentType('./test/files/file.txt'), {
            mime: 'text/plain',
            encoding: "us-ascii"
        });
    });

    describe("file tool fallback", () => {

        afterEach(function() {
            mockRequire.stop("child_process");
        });

        it('provides a fallback if the file command fails', async function () {
            mockRequire("child_process", {
                exec: () => {
                    throw new Error('file command failure simulation');
                }
            });
            const detectContentType = mockRequire.reRequire("../lib/utils/type");

            assert.deepStrictEqual(await detectContentType('./test/files/file.jpg'), {
                mime: "image/jpeg"
            });
        });
    });

});
