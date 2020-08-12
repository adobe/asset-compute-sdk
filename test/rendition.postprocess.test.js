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

const { worker } = require('../lib/api');

const testUtil = require('./testutil');
const mockFs = require('mock-fs');
const assert = require('assert');

const fs = require('fs-extra');
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");

const PNG_FILE = "test/files/fileSmall.png";

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
        const expectedFileBase64 = "ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMjAwMWMwMDFjMDAwMGZmZGIwMDQzMDAwMzAyMDIwMjAyMDIwMzAyMDIwMjAzMDMwMzAzMDQwNjA0MDQwNDA0MDQwODA2MDYwNTA2MDkwODBhMGEwOTA4MDkwOTBhMGMwZjBjMGEwYjBlMGIwOTA5MGQxMTBkMGUwZjEwMTAxMTEwMGEwYzEyMTMxMjEwMTMwZjEwMTAxMGZmZGIwMDQzMDEwMzAzMDMwNDAzMDQwODA0MDQwODEwMGIwOTBiMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMGZmYzAwMDExMDgwMDA2MDAwYTAzMDExMTAwMDIxMTAxMDMxMTAxZmZjNDAwMTQwMDAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDZmZmM0MDAxZjEwMDAwMTAzMDQwMzAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMzAyMDEwNjA0MDgxMTEyMzEwMDA3ODFmZmM0MDAxNTAxMDEwMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMjA2ZmZjNDAwMjExMTAwMDEwMzAzMDQwMzAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMzAyMDAxMTA0MjE0MTkyZDExMzE0YzFlMmZmZGEwMDBjMDMwMTAwMDIxMTAzMTEwMDNmMDAwZjFlYjMxYjY3ODkxYzg2OTFhYTYzMjkzNTBhZGQyNTA5MGExYTJhNzIyOTliOGMyMzc1NmJmN2I2OGEzNmNlZDQ4NmE2ODhjZWE0OTNjNDk3NjJkN2ViMDJlNTE1MDI5YTM0N2IzNThiODFlMjU2OWNjMTFiMjZkZjQ4YTRlYWQ4NzVjYTZhZjY3NmM3MmY4NGYzZDdlNjAxOGEzNzYwZTYyMDgyYWUxNWVjNzZlZjk5ZmZkOQ==";
        assert.ok(expectedFileBase64 === uploadedFileBase64);
    });

    it('should download source, invoke worker callback and upload rendition', async () => {
        let sourcePath, renditionPath, renditionDir;

        function batchWorkerFn(source, renditions, outDirectory) {
            /*assert.equal(typeof source, "object");
            assert.equal(typeof source.path, "string");
            assert.ok(fs.existsSync(source.path));
            assert.equal(fs.readFileSync(source.path), testUtil.SOURCE_CONTENT);
            sourcePath = source.path;

            assert.ok(Array.isArray(renditions));
            assert.equal(renditions.length, 1);
            const rendition = renditions[0];
            assert.equal(typeof rendition.path, "string");
            assert.equal(typeof rendition.name, "string");
            assert.equal(typeof outDirectory, "string");
            assert.ok(fs.existsSync(outDirectory));
            assert.ok(fs.statSync(outDirectory).isDirectory());
            assert.ok(!fs.existsSync(rendition.path));
            renditionPath = rendition.path;
            renditionDir = rendition.directory;

            fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);*/
            return Promise.resolve();
        }

        const main = batchWorker(batchWorkerFn);
        const result = await main(testUtil.simpleParams());
    });
});
