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

const { worker, batchWorker } = require('../lib/api');

const testUtil = require('./testutil');
const mockFs = require('mock-fs');
const assert = require('assert');

const fs = require('fs-extra');
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");

const PNG_FILE = "test/files/fileSmall.png";
const BMP_FILE = "test/files/file.bmp";
const GIF_FILE = "test/files/file.gif";
const JPG_FILE = "test/files/file.jpg";

const BASE64_RENDITION_JPG = "ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMjAwMWMwMDFjMDAwMGZmZGIwMDQzMDAwMzAyMDIwMjAyMDIwMzAyMDIwMjAzMDMwMzAzMDQwNjA0MDQwNDA0MDQwODA2MDYwNTA2MDkwODBhMGEwOTA4MDkwOTBhMGMwZjBjMGEwYjBlMGIwOTA5MGQxMTBkMGUwZjEwMTAxMTEwMGEwYzEyMTMxMjEwMTMwZjEwMTAxMGZmZGIwMDQzMDEwMzAzMDMwNDAzMDQwODA0MDQwODEwMGIwOTBiMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMGZmYzAwMDExMDgwMDA2MDAwYTAzMDExMTAwMDIxMTAxMDMxMTAxZmZjNDAwMTQwMDAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDZmZmM0MDAxZjEwMDAwMTAzMDQwMzAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMzAyMDEwNjA0MDgxMTEyMzEwMDA3ODFmZmM0MDAxNTAxMDEwMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMjA2ZmZjNDAwMjExMTAwMDEwMzAzMDQwMzAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMzAyMDAxMTA0MjE0MTkyZDExMzE0YzFlMmZmZGEwMDBjMDMwMTAwMDIxMTAzMTEwMDNmMDAwZjFlYjMxYjY3ODkxYzg2OTFhYTYzMjkzNTBhZGQyNTA5MGExYTJhNzIyOTliOGMyMzc1NmJmN2I2OGEzNmNlZDQ4NmE2ODhjZWE0OTNjNDk3NjJkN2ViMDJlNTE1MDI5YTM0N2IzNThiODFlMjU2OWNjMTFiMjZkZjQ4YTRlYWQ4NzVjYTZhZjY3NmM3MmY4NGYzZDdlNjAxOGEzNzYwZTYyMDgyYWUxNWVjNzZlZjk5ZmZkOQ==";

describe("imagePostProcess", () => {
    beforeEach(function () {
        process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;
        process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;
        process.env.DISABLE_IO_EVENTS_ON_TIMEOUT = true;
        process.env.OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION = true;
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        testUtil.beforeEach();

        mockFs.restore();
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
    });

    afterEach(() => {
        testUtil.afterEach();
        delete process.env.WORKER_BASE_DIRECTORY;
    });

    it('should convert PNG to JPG - end to end test', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = worker(workerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[0].metadata["tiff:imageWidth"], 10);
        assert.equal(events[0].metadata["tiff:imageHeight"], 6);
        assert.equal(events[0].metadata["dc:format"], "image/jpeg");
        
        const uploadedFileBase64 = Buffer.from(uploadedRenditions["/MyRendition.jpeg"]).toString('base64');
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64);
    });

    it('should download source, invoke worker in batch callback and upload rendition - same rendition', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        async function batchWorkerFn(source, renditions, outDirectory) {
            assert.equal(typeof source, "object");
            assert.equal(typeof source.path, "string");
            assert.ok(fs.existsSync(source.path));
            // sourcePath = source.path;

            assert.ok(Array.isArray(renditions));
            assert.equal(renditions.length, 3);
            const rendition = renditions[0];
            assert.equal(typeof rendition.path, "string");
            assert.equal(typeof rendition.name, "string");
            assert.equal(typeof outDirectory, "string");
            assert.ok(fs.existsSync(outDirectory));
            assert.ok(fs.statSync(outDirectory).isDirectory());
            assert.ok(!fs.existsSync(rendition.path));

            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
            return Promise.resolve();
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition1.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition3.jpeg"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "jpg");

        const uploadedFileBase64_1 = Buffer.from(uploadedRenditions["/MyRendition1.jpeg"]).toString('base64');
        const uploadedFileBase64_2 = Buffer.from(uploadedRenditions["/MyRendition2.jpeg"]).toString('base64');
        const uploadedFileBase64_3 = Buffer.from(uploadedRenditions["/MyRendition3.jpeg"]).toString('base64');

        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_1);
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_2);
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_3);
    });
    it('should download source, invoke worker in batch callback and upload rendition - different rendition', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        async function batchWorkerFn(source, renditions, outDirectory) {
            assert.equal(typeof source, "object");
            assert.ok(Array.isArray(renditions));
            assert.equal(typeof outDirectory, "string");
            
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
            return Promise.resolve();
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition1.png"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            },{
                fmt: "bmp",
                target: "https://example.com/MyRendition3.bmp"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "png");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "bmp");

        // TODO use fileSmall
        // const BMP_FILE = "test/files/file.bmp";
        // const GIF_FILE = "test/files/file.gif";
        // const JPG_FILE = "test/files/file.jpg";
        // // const uploadedFileBase64_1 = Buffer.from(uploadedRenditions["/MyRendition1.png"]).toString('base64');
        // const uploadedFileBase64_2 = Buffer.from(uploadedRenditions["/MyRendition2.jpeg"]).toString('base64');
        // const uploadedFileBase64_3 = Buffer.from(uploadedRenditions["/MyRendition3.jpeg"]).toString('base64');

        // assert.ok(BASE64_RENDITION_PNG  === uploadedFileBase64_1);
        // assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_2);
        // assert.ok(BASE64_RENDITION_PNG  === uploadedFileBase64_3);
    });
});
