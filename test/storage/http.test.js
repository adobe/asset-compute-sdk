/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 *  NOTICE:  All information contained herein is, and remains
 *  the property of Adobe Systems Incorporated and its suppliers,
 *  if any.  The intellectual and technical concepts contained
 *  herein are proprietary to Adobe Systems Incorporated and its
 *  suppliers and are protected by trade secret or copyright law.
 *  Dissemination of this information or reproduction of this material
 *  is strictly forbidden unless prior written permission is obtained
 *  from Adobe Systems Incorporated.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';
const mockFs = require("mock-fs");
const fs = require('fs-extra');
const {download, upload} = require('../../lib/storage/http');
const nock = require('nock');
const assert = require('assert');

const http = require('@nui/node-httptransfer');

const oldDownloadFileHttpTransfer = http.downloadFile;

describe('http.js', () => {

    describe('download', () => {

        beforeEach( () => {
            mockFs();
        })
        afterEach( () => {
            http.downloadFile = oldDownloadFileHttpTransfer;
            nock.cleanAll();
            mockFs.restore();
        })

        it.skip("should download actual jpg file", async () => { // this test is skipped in case internet is down
            const source = {
                url: "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg"
            };

            mockFs({ './storeFiles/jpg': {} });

            const file = './storeFiles/jpg/earth.jpg'
            await download(source, file);
            assert.ok(fs.existsSync(file));
        }).timeout(5000);

        it("should download jpg file", async () => { // this test is skipped in case internet is down
            const source = {
                url: "https://example.com/fakeEarth.jpg"
            };

            mockFs({ './storeFiles/jpg': {} });

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok")

            const file = './storeFiles/jpg/fakeEarth.jpg'

            await download(source, file);
            assert.ok(fs.existsSync(file));
            assert.ok(nock.isDone());
        });

        it("should fail downloading a jpg file", async () => { // this test is skipped in case internet is down
            const source = {
                url: "https://example.com/fakeEarth.jpg"
            };
            mockFs({ './storeFiles/jpg': {} });

            http.downloadFile = function() {
                throw new Error('ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.')
            }
            const file = './storeFiles/jpg/fakeEarth.jpg';
            try {
                await download(source, file);
            } catch (e) {
                assert.equal(e.name, 'GenericError');
                assert.equal(e.message, 'ERRRR. GET \'https://example.com/fakeEarth.jpg\' failed with status 404.');
                assert.equal(e.location, 'worker-test_download');
            }
            assert.ok(! fs.existsSync(file));
        });

        it("should fail downloading once before succeeding", async () => {
            const source = { url: "https://example.com/fakeEarth.jpg" };

            mockFs({ './storeFiles/jpg': {} });

            const file = './storeFiles/jpg/fakeEarth.jpg';

            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(504, "error")
            nock("https://example.com")
                .get("/fakeEarth.jpg")
                .reply(200, "ok")

            process.env.__OW_DEADLINE = Date.now() + 1000;
            await download(source, file);
            assert.ok(nock.isDone());
            assert.ok(fs.existsSync(file));
        });
    })
    describe('upload', () => {

        beforeEach( () => {
            mockFs();
        })
        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            process.env.NUI_DISABLE_RETRIES = undefined;
        })

        it("should upload one rendition successfully", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200)

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });

        it("should fail uploading a rendition with 504", async () => {
            process.env.NUI_DISABLE_RETRIES = true // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .replyWithError(504)

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.equal(e.name, "GenericError");
                assert.equal(e.message, "PUT 'https://example.com/fakeEarth.jpg' failed: request to https://example.com/fakeEarth.jpg failed, reason: 504");
                assert.equal(e.location, "worker-test_upload");
            }
            assert.ok(nock.isDone());
        });

        it.skip("should fail uploading once before succeeding", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg"
            };
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(503, "error")
            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200, "ok")

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(nock.isDone());
        });


        it("should fail uploading a rendition with 404", async () => {
            process.env.NUI_DISABLE_RETRIES = true // disable retries to test upload failure
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg"
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(404, "error")

            assert.ok(fs.existsSync(file));
            try {
                await upload(rendition);
            } catch (e) {
                assert.equal(e.name, "GenericError");
                assert.equal(e.message, "PUT 'https://example.com/fakeEarth.jpg' failed with status 404");
                assert.equal(e.location, "worker-test_upload");
            }
            assert.ok(nock.isDone());
        });

        it("should not fail when trying to update a rendition with no file path bu", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200)

            const rendition = {
                id: () => { return '1234'},
                target: "https://example.com/fakeEarth.jpg"
            };


            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok( ! nock.isDone());
        });

        it("should not fail when trying to update a rendition with no target", async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                id: () => { return '1234'},
                path: file
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200)

            assert.ok(fs.existsSync(file));
            await upload(rendition);
            assert.ok(! nock.isDone());
        });

    });
});