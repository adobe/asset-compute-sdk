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
const nock = require('nock');
const fs = require('fs-extra');
const readChunk = require('read-chunk');
const ImageInfo = require('../../lib/utils/image-info.js');
const bytesToRead = 10000;

describe.skip("image-info.js", function (){
    afterEach(() => {
        nock.cleanAll();
    });

    it("returns image information for png file", async function(){
        const filePath = "test/files/file.png";
        const result = ImageInfo.getImageInfoFromFile(filePath);
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'png');
    });

    it("returns image information for svg file", async function(){
        const filePath = "test/files/negative/file.svg";
        const result = ImageInfo.getImageInfoFromFile(filePath);
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'svg');
    });

    it("returns image information for tiff file", async function () {
        const filePath = "test/files/file.tif";
        const result = ImageInfo.getImageInfoFromFile(filePath);
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'tiff');
    });

    it("fails to return image information for nonexistent file", async function () {
        const filePath = "test/files/NoSuchFile.tif";
        let errThrown = false;
        try {
            ImageInfo.getImageInfoFromFile(filePath);
        } catch (err) { /* eslint-disable-line no-unused-vars */
            errThrown = true;
        }
        assert.equal(errThrown, true);
    });

    it("fails to return image information for non-image", async function () {
        const filePath = "test/files/file.txt";
        let errThrown = false;
        try {
            ImageInfo.getImageInfoFromFile(filePath);
        } catch (err) { /* eslint-disable-line no-unused-vars */
            errThrown = true;
        }
        assert.equal(errThrown, true);
    });

    it("return image information for jpeg image from url", async function () {
        const fstat = await fs.stat('test/files/file.jpg');
        const data = await readChunk('test/files/file.jpg', 0, fstat.size);
        const url = 'https://example.com/file.jpg';
        nock('https://example.com')
            .get('/file.jpg')
            .reply(200, data);
        const result = await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        assert(nock.isDone());
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'jpg');
        assert.equal(result.orientation, 1);
    });

    it("return image information for jpeg image from url with orientation", async function () {
        const data = await readChunk('test/files/fOrientation5.jpg', 0, bytesToRead);
        const url = 'https://example.com/fOrientation5.jpg';
        nock('https://example.com')
            .get('/fOrientation5.jpg')
            .reply(200, data);
        const result = await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        assert(nock.isDone());
        assert.equal(result.width, 1200);
        assert.equal(result.height, 1800);
        assert.equal(result.type, 'jpg');
        assert.equal(result.orientation, 5);
    });

    it("return image information for gif image from url", async function () {
        const data = await readChunk('test/files/file.gif', 0, bytesToRead);
        const url = 'https://example.com/file.gif';
        nock('https://example.com')
            .get('/file.gif')
            .reply(200, data);
        const result = await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        assert(nock.isDone());
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'gif');
    });

    it("return image information for bmp image from url", async function () {
        const data = await readChunk('test/files/file.bmp', 0, bytesToRead);
        const url = 'https://example.com/file.bmp';
        nock('https://example.com')
            .get('/file.bmp')
            .reply(200, data);
        const result = await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        assert(nock.isDone());
        assert.equal(result.width, 512);
        assert.equal(result.height, 288);
        assert.equal(result.type, 'bmp');
    });

    it("return image information for small png image from url", async function () {
        const data = await readChunk('test/files/fileSmall.png', 0, bytesToRead);
        const url = 'https://example.com/fileSmall.png';
        nock('https://example.com')
            .get('/fileSmall.png')
            .reply(200, data);
        const result = await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        assert(nock.isDone());
        assert.equal(result.width, 10);
        assert.equal(result.height, 6);
        assert.equal(result.type, 'png');
    });


    it("image information for tiff image from url throws", async function () {
        const data = await readChunk('test/files/file.tif', 0, bytesToRead);
        const url = 'https://example.com/file.tif';
        nock('https://example.com')
            .get('/file.tif')
            .reply(200, data);
        let errThrown = false;
        try {
            await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
        } catch (err) { /* eslint-disable-line no-unused-vars */
            errThrown = true;
        }
        assert.equal(errThrown, true);
        assert(nock.isDone());
    });

    it("gracefully handles not being able to get data from the image url", async function () {
        const data = await readChunk('test/files/fileSmall.png', 0, bytesToRead);
        const url = 'https://example.com/fileSmall.png';
        nock('https://example.com')
            .get('/fileSmall.png')
            .reply(404, data);

        // assert.throws is not happy with async functions currently, so...
        try {
            await ImageInfo.getImageInfoFromUrl(url, bytesToRead);
            assert.fail("Should have thrown");
        } catch(err) {
            assert.equal(err.message, 'failed to retrieve data from url');
        }
        assert(nock.isDone());
    });
});
