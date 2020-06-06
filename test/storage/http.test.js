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

const mockFs = require("mock-fs");
const fs = require('fs-extra');
const { download, upload } = require('../../lib/storage/http');
const nock = require('nock');
const assert = require('assert');

const http = require('@adobe/httptransfer');

const oldDownloadFileHttpTransfer = http.downloadFile;

describe('http.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        http.downloadFile = oldDownloadFileHttpTransfer;
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
        delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
    });

    describe('download', () => {

        it("should download jpg file", async () => { // this test is skipped in case internet is down
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: "fakeEarth.jpg"
            };

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok");

            const file = './storeFiles/jpg/fakeEarth.jpg';

            await download( source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });


        it("should fail downloading a jpg file mocking @adobe/httptransfer", async () => {
            const source = {
                url: "https://example.com/fakeEarth.jpg"
            };
            mockFs({ './storeFiles/jpg': {} });

            http.downloadFile = function() {
                throw new Error('ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
            };
            const file = './storeFiles/jpg/fakeEarth.jpg';
            try {
                await download(source, file);
            } catch (e) {
                assert.equal(e.name, 'GenericError');
                assert.equal(e.message, 'ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
                assert.equal(e.location, 'test_action_download');
            }
            assert.ok(! fs.existsSync(file));
        });

        it("should fail downloading a jpg file", async () => {
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            assert.ok(! fs.existsSync(file));
            const source = {
                url: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg'
            };
            mockFs({ "./storeFiles/jpg": {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(404, "error");

            try {
                await download(source, file);
            } catch (e) {
                assert.equal(e.name, "GenericError");
                assert.equal(e.message, "GET 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.equal(e.location, "test_action_download");
            }
            assert.equal(fs.statSync(file).size, 0); // should error on createReadStream
        });

        it("should fail downloading once before succeeding", async () => {
            const source = { url: "https://example.com/fakeEarth.jpg" };

            mockFs({ './storeFiles/jpg': {} });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(504, "error");
            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok");

            process.env.__OW_DEADLINE = Date.now() + 1000;
            await download(source, file);
            assert.ok(nock.isDone());
            assert.ok(fs.existsSync(file));
        });
    });
    describe('upload', () => {

        it("should upload one rendition successfully", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                name: 'fakeEarth.jpg',
                size: () => 1,
				inline: () => false,
				mimeType: () => "image/jpeg"
            };

            nock("https://example.com")
                .matchHeader('content-type', 'image/jpeg')
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });

        it("should fail uploading a rendition with 504", async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
				inline: () => false,
				mimeType: () => "image/jpeg"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .replyWithError(504);

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.equal(e.name, "GenericError");
                assert.ok(e.message.includes("failed: request to https://example.com/fakeEarth.jpg failed, reason: 504"));
                assert.equal(e.location, "test_action_upload");
            }
            assert.ok(nock.isDone());
        });

        it("should fail uploading once before succeeding", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
				inline: () => false,
				mimeType: () => "image/jpeg"
            };
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(503, "error");
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200, "ok");

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });


        it("should fail uploading a rendition with 404", async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
				inline: () => false,
				mimeType: () => "image/jpeg"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(404, "error");

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.equal(e.name, "GenericError");
                assert.equal(e.message, "PUT 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.equal(e.location, "test_action_upload");
            }
            assert.ok(nock.isDone());
        });

        it("should not fail when trying to update a rendition with no file path", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            const rendition = {
                id: () => { return '1234';},
                target: "https://example.com/fakeEarth.jpg"
            };


            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
                assert.fail('Should have failed during upload');
            } catch (e) {
                assert.equal(e.name, 'GenericError');
                assert.equal(e.message, 'rendition 1234 does not have a file path: undefined');
                assert.equal(e.location, 'test_action_upload');
            }
            assert.ok( ! nock.isDone());
        });

        it("should not fail when trying to update a rendition with no target", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                id: () => { return '1234';},
                path: file
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(! nock.isDone());
        });

    });
});
