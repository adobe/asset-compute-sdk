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

const {getSource, putRendition} = require('../lib/storage');
const mockFs = require('mock-fs');
const nock = require('nock');
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { GenericError } = require('@adobe/asset-compute-commons');

describe('storage.js', () => {
    describe('getSource', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });
        it('should download simple png and return a new source object', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'ok');

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'source.png');
            assert.equal(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download data uri and return new source object', async () => {
            const paramsSource = {
                url: 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'source');
            assert.equal(source.path, 'in/fakeSource/filePath/source');
            assert.ok(fs.existsSync(source.path));
            assert.equal(fs.readFileSync(source.path).toString(), 'Hello, World!');
            assert.ok(nock.isDone());
        });

        it('should fail during download', async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(404, 'ok');

            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                console.log(e);
                assert.ok(e instanceof GenericError);
                assert.equal(e.message, "GET 'https://example.com/photo/elephant.png' failed with status 404");
                threw = true;
            }
            assert.ok(threw);
        });

        it('should not download a file in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg'
            };
            const inDirectory = '/in';

            mockFs({ '/in/file.jpg': 'yo' });

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'file.jpg'); // in this case source name is actual file path
            assert.equal(source.path, '/in/file.jpg');
        });

        it('should fail to download because path ends with /..', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg/..'
            };
            const inDirectory = '/in';

            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file file.jpg/..');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of invalid localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file/../../../../evilcode/elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file file/../../../../evilcode/elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of missing localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });
    });

    describe('putRendition', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });

        it('should upload simple rendition', async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(nock.isDone());

        });

        it('should upload simple rendition (not in test mode)', async () => {
            delete process.env.WORKER_TEST_MODE;

            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(nock.isDone());
        });

        it('should copy simple rendition, but not upload (in test mode)', async () => {
            process.env.WORKER_TEST_MODE = true;

            mockFs({
                "./storeFiles/jpg": {
                    "fakeEarth.jpg": "hello world!"
                }
            });
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const requestedFile = "./storeFiles/jpg/rendition.jpg";

            const rendition = {
                directory: "./storeFiles/jpg",
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                instructions: { name: path.basename(requestedFile) }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(fs.existsSync(file));
            assert.ok(fs.existsSync(requestedFile));
            assert.ok(! nock.isDone());
        });
    });
});
