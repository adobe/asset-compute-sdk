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

const { RenditionTooLarge } = require('@adobe/asset-compute-commons');
const http =  require('../../lib/storage/http');
const mockFs = require('mock-fs');
const assert = require('assert');
const nock = require('nock');
const rimraf = require('rimraf');
const util = require('util');

const removeFiles = util.promisify(rimraf);

describe.only('http.js (multipart)', function() {
    describe('http multipart upload', function() {
        beforeEach(async function() {
            mockFs();
        });

        afterEach(async function() {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
            try {
                await removeFiles("rendition*");
            } catch (err) {
                // Don't allow error to break tests.  We are just trying to do cleanup.
                console.log('error removing files ' + err);
            }
        });

        function _buildMultipartData(minPartSize=0, maxPartSize=-1, urlCount=5, addFiles=true) {
            const renditionName = `rendition`;
            const path = "/jpg/rendition.jpg";
            if (addFiles) {
                mockFs({ "/jpg": {
                    "rendition.jpg": "hello multipart uploading world!\n"
                } });
            }
            const urls = [];
            for (let u = 0; u < urlCount; u++) {
                urls.push(`http://unittest/${renditionName}_${u+1}`);
            }
            return {
                name: `${renditionName}.jpg`,
                path: path,
                target: {
                    minPartSize,
                    maxPartSize,
                    urls
                },
                id: () => {return 12345;},
                size: () => { return 230;},
                contentType: () => { return "application/octet-stream" }
            };

        }

        it('single upload', async () => {
            const rendition = _buildMultipartData(0, 33, 1);
            nock('http://unittest')
                .matchHeader('content-length', 33)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart uploading world!\n')
                .reply(201);

            try {
                await http.upload(rendition);
            } catch (err) {
                console.log(err);
                assert(false);
            }
            assert(nock.isDone());
        });

        it('should fail on first attempt then succeed', async () => {
            const rendition  = _buildMultipartData(0, 33, 1);
            nock('http://unittest')
                .matchHeader('content-length', 33)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart uploading world!\n')
                .replyWithError(503);
            nock('http://unittest')
                .matchHeader('content-length', 33)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart uploading world!\n')
                .reply(201);

            try {
                await http.upload(rendition);
            } catch (err) {
                console.log(err);
                assert(false);
            }
            assert(nock.isDone());
        });

        it('single upload_no_target', async () => {
            const rendition = _buildMultipartData(0, 10, 1);
            delete rendition.target;
            try {
                await http.upload(rendition);
            } catch (err) {
                console.log(err);
                assert(false);
            }
        });

        it('test multipart upload', async () => {
            const rendition = _buildMultipartData(5, 7, 5);
            nock('http://unittest')
                .matchHeader('content-length',7)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello m')
                .reply(201);
            nock('http://unittest')
                .matchHeader('content-length', 7)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_2', 'ultipar')
                .reply(201);
            nock('http://unittest')
                .matchHeader('content-length', 7)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_3', 't uploa')
                .reply(201);
            nock('http://unittest')
                .matchHeader('content-length', 7)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_4', 'ding wo')
                .reply(201);
            nock('http://unittest')
                .matchHeader('content-length', 5)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_5', 'rld!\n')
                .reply(201);

            try {
                await http.upload(rendition);
            } catch (err) {
                console.log(err);
                assert(false);
            }
            assert(nock.isDone());
        });

        it('test renditions with failure', async function() {
            const rendition = _buildMultipartData(5, 20, 2);
            nock('http://unittest')
                .matchHeader('content-length',17)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart u')
                .thrice()
                .reply(500); // invokes retry
            nock('http://unittest')
                .matchHeader('content-length',17)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart u')
                .reply(201); // retry succeeds
            nock('http://unittest')
                .matchHeader('content-length', 16)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_2', 'ploading world!\n')
                .reply(201);
            await http.upload(rendition);
            assert(nock.isDone());
        }).timeout(5000);

        it('test rendition with RenditionTooLarge failure', async function() {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true;
            const rendition = _buildMultipartData(0, 33, 1);
            nock('http://unittest')
                .matchHeader('content-length',33)
                .matchHeader('content-type', 'image/jpeg')
                .defaultReplyHeaders({
                    'Content-Type': 'text/plain',
                })
                .put('/rendition_1', 'hello multipart uploading world!\n')
                .reply(413,'The request body is too large to upload');
            let threw = false;
            try {
                await http.upload(rendition);
            } catch (err) {
                assert.equal(err.name, 'RenditionTooLarge');
                threw = true;
            }
            assert.ok(threw);
        }).timeout(5000);

        it('test insufficient urls', async () => {
            const rendition = _buildMultipartData(0, 7, 2);
            let threw = false;
            try {
                await http.upload(rendition);
            }
            catch (e) {
                console.log(e);
                assert(e instanceof RenditionTooLarge);
                threw = true;
            }
            assert.ok(threw);
        });

        it('test min part size', async () => {
            nock('http://unittest')
                .matchHeader('content-length',20)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_1', 'hello multipart uplo')
                .reply(201);
            nock('http://unittest')
                .matchHeader('content-length',13)
                .matchHeader('content-type', 'image/jpeg')
                .put('/rendition_2', 'ading world!\n')
                .reply(201);

            const rendition = _buildMultipartData(20, 100);
            await http.upload(rendition);
            assert(nock.isDone());
        });

    });
});
