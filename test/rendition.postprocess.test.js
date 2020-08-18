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

// const { worker, batchWorker } = require('../lib/api');
const mockRequire = require("mock-require");
const { MetricsTestHelper } = mockRequire.reRequire("@adobe/asset-compute-commons");
const assert = require('assert');
const mockFs = require('mock-fs');
const fs = require('fs-extra');
const testUtil = require('./testutil');
const { worker, batchWorker } = require('../lib/api');

const PNG_FILE = "test/files/fileSmall.png";

const BASE64_RENDITION_JPG = "ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMjAwMWMwMDFjMDAwMGZmZGIwMDQzMDAwMzAyMDIwMjAyMDIwMzAyMDIwMjAzMDMwMzAzMDQwNjA0MDQwNDA0MDQwODA2MDYwNTA2MDkwODBhMGEwOTA4MDkwOTBhMGMwZjBjMGEwYjBlMGIwOTA5MGQxMTBkMGUwZjEwMTAxMTEwMGEwYzEyMTMxMjEwMTMwZjEwMTAxMGZmZGIwMDQzMDEwMzAzMDMwNDAzMDQwODA0MDQwODEwMGIwOTBiMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMDEwMTAxMGZmYzAwMDExMDgwMDA2MDAwYTAzMDExMTAwMDIxMTAxMDMxMTAxZmZjNDAwMTQwMDAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDZmZmM0MDAxZjEwMDAwMTAzMDQwMzAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMzAyMDEwNjA0MDgxMTEyMzEwMDA3ODFmZmM0MDAxNTAxMDEwMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMjA2ZmZjNDAwMjExMTAwMDEwMzAzMDQwMzAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwMzAyMDAxMTA0MjE0MTkyZDExMzE0YzFlMmZmZGEwMDBjMDMwMTAwMDIxMTAzMTEwMDNmMDAwZjFlYjMxYjY3ODkxYzg2OTFhYTYzMjkzNTBhZGQyNTA5MGExYTJhNzIyOTliOGMyMzc1NmJmN2I2OGEzNmNlZDQ4NmE2ODhjZWE0OTNjNDk3NjJkN2ViMDJlNTE1MDI5YTM0N2IzNThiODFlMjU2OWNjMTFiMjZkZjQ4YTRlYWQ4NzVjYTZhZjY3NmM3MmY4NGYzZDdlNjAxOGEzNzYwZTYyMDgyYWUxNWVjNzZlZjk5ZmZkOQ==";
const BASE64_RENDITION_PNG = "ODk1MDRlNDcwZDBhMWEwYTAwMDAwMDBkNDk0ODQ0NTIwMDAwMDAwYTAwMDAwMDA2MDgwMzAwMDAwMGNkMmVmZmY0MDAwMDAwYjQ1MDRjNTQ0NTAyMDIwNDAzMDMwNTA0MDQwNjAzMDMwNzAyMDMwODA0MDUwZTAwMDAwZjAwMDAxNDA4MDgyMTBhMGEyYjAzMDIwZDAyMDEwZjAzMDExNDA1MDMxYjA1MDQyMzAwMDAyNzExMTk0NTE0MjU1NjAwMTE1MTAwMmE2YjA5MGIzNDAyMGQzZjAwMTQ1MTAwMjI2NTA0Mzg3ZDE0NTE5MjRjODRjMTc1YWJkZTcxYWVkOTk0Y2NlZTE1NWE5YjJlN2NiYjUzOWRkMzczYjhlNjhjY2FmM2E3ZGNmY2JjZTNmYmNiZTdmOWQ2ZWFmOWQzZTBmMjk1ZDlmOGFkZTFmYmI1ZGFmM2FmY2VlN2FkYzRkYWFhYmFjZjk5YWRjNTdlOTliZDZkOGJiNzZjODdiNTk0YWNjZTc3OTFiYzY2ODZhZjc4OGVhYTg2OTRhNjdlOGY5ZjdhOGM5ZTY5ODM5YjY3ODA5YjdiOGFhMDU0NjY3OWExMDAwMDAwNDg0OTQ0NDE1NDA4ZDcwNWMxODMwMWMwMDAwYzAwYjBjZWI2NmRkYmZhZmZhZjI1MDAwODhhZTEwNDQ5ZDEwY2IwMWMyZjg4OTJhY2E4MWFlODg2NjlkOThlZWJmOTAxODQ1MTljYTQ1OTVlOTQxNWQ0NGRkYmY1YzMzOGNkMGJhY2RiN2U5Y2Q3ZmRiY2RmMGY5NzRiMDZlYjI5ZTRmMmZiMDAwMDAwMDA0OTQ1NGU0NGFlNDI2MDgy";
const BASE64_RENDITION_TIFF = "NDk0OTJhMDBiYzAwMDAwMDAyMDIwNDAzMDMwNTA0MDQwNjAzMDMwNzAyMDMwODA0MDUwZTAwMDAwZjAwMDAxNDA4MDgyMTBhMGEyYjAzMDIwZDAyMDEwZjAzMDExNDA1MDMxYjA1MDQyMzAwMDAyNzExMTk0NTE0MjU1NjAwMTE1MTAwMmE2YjA5MGIzNDAyMGQzZjAwMTQ1MTAwMjI2NTA0Mzg3ZDE0NTE5MjRjODRjMTc1YWJkZTcxYWVkOTk0Y2NlZTE1NWE5YjJlN2NiYjUzOWRkMzczYjhlNjhjY2FmM2E3ZGNmY2JjZTNmYmNiZTdmOWQ2ZWFmOWQzZTBmMjk1ZDlmOGFkZTFmYmI1ZGFmM2FmY2VlN2FkYzRkYWFhYmFjZjk5YWRjNTdlOTliZDZkOGJiNzZjODdiNTk0YWNjZTc3OTFiYzY2ODZhZjc4OGVhYTg2OTRhNjdlOGY5ZjdhOGM5ZTY5ODM5YjY3ODA5YjdiOGFhMDEyMDAwMDAxMDMwMDAxMDAwMDAwMGEwMDAwMDAwMTAxMDMwMDAxMDAwMDAwMDYwMDAwMDAwMjAxMDMwMDAzMDAwMDAwYWEwMTAwMDAwMzAxMDMwMDAxMDAwMDAwMDEwMDAwMDAwNjAxMDMwMDAxMDAwMDAwMDIwMDAwMDAwYTAxMDMwMDAxMDAwMDAwMDEwMDAwMDAxMTAxMDQwMDAxMDAwMDAwMDgwMDAwMDAxMjAxMDMwMDAxMDAwMDAwMDEwMDAwMDAxNTAxMDMwMDAxMDAwMDAwMDMwMDAwMDAxNjAxMDMwMDAxMDAwMDAwMDYwMDAwMDAxNzAxMDQwMDAxMDAwMDAwYjQwMDAwMDAxYTAxMDUwMDAxMDAwMDAwOWEwMTAwMDAxYjAxMDUwMDAxMDAwMDAwYTIwMTAwMDAxYzAxMDMwMDAxMDAwMDAwMDEwMDAwMDAyODAxMDMwMDAxMDAwMDAwMDMwMDAwMDAyOTAxMDMwMDAyMDAwMDAwMDAwMDAxMDAzZTAxMDUwMDAyMDAwMDAwZTAwMTAwMDAzZjAxMDUwMDA2MDAwMDAwYjAwMTAwMDAwMDAwMDAwMGZmZmZmZmZmZWFhYzA3MDlmZmZmZmZmZmVhYWMwNzA5MDgwMDA4MDAwODAwZmYwOWQ3YTNmZmZmZmZmZjdmZTE3YTU0ZmZmZmZmZmZmZmNjY2M0Y2ZmZmZmZmZmZmY5OTk5OTlmZmZmZmZmZjdmNjY2NjI2ZmZmZmZmZmZlZjI4NWMwZmZmZmZmZmZmN2YxYjBkNTBmZmZmZmZmZmZmNTczOTU0ZmZmZmZmZmY=";

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
        mockRequire.stop('@adobe/asset-compute-image-processing');
    });

    after(() => {
        mockRequire.stop('@adobe/asset-compute-image-processing');
    });

    it('should convert PNG to JPG - end to end test', async () => {
        mockRequire.stopAll();
        mockRequire("@adobe/asset-compute-image-processing", {
            imgProcessingEngine: {
                imageProcess: async function(infile, outfile, instructions) {
                    console.log('mocked image post processing', outfile, infile);
                    await fs.copyFile('test/files/generatedFileTooSmall.jpg',outfile);
                    console.log('COPIED FILE size', fs.statSync('test/files/generatedFileTooSmall.jpg').size);
                    // throw new Error('conversion using image processing lib (imagemagick) failed: Error!, code: 7, signal: null');
                }
            }
        });
        mockRequire.reRequire('../lib/worker'); // '@adobe/asset-compute-image-processing' is a dependency of lib/worker.js so it must be reloaded
        const { worker } = mockRequire.reRequire('../lib/api');
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
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

        const expected_rendtion = 'ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMDAwMDEwMDAxMDAwMGZmZGIwMDQzMDAwYzA4MDkwYjA5MDgwYzBiMGEwYjBlMGQwYzBlMTIxZTE0MTIxMTExMTIyNTFiMWMxNjFlMmMyNzJlMmUyYjI3MmIyYTMxMzc0NjNiMzEzNDQyMzQyYTJiM2Q1MzNlNDI0ODRhNGU0ZjRlMmYzYjU2NWM1NTRjNWI0NjRkNGU0YmZmZGIwMDQzMDEwZDBlMGUxMjEwMTIyNDE0MTQyNDRiMzIyYjMyNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YmZmYzIwMDExMDgwMDA2MDAwYTAzMDExMTAwMDIxMTAxMDMxMTAxZmZjNDAwMTUwMDAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDMwNGZmYzQwMDE2MDEwMTAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA0MDEwMmZmZGEwMDBjMDMwMTAwMDIxMDAzMTAwMDAwMDA4OTY3N2JhZmZmYzQwMDFlMTAwMDAxMDQwMTA1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMzA0MDYwNTE0MTU1NTgyOTRmZmRhMDAwODAxMDEwMDAxM2YwMDhiNTRjMmIyZjEwM2RhYTk0NjFkMDU2ZDM1ZGUyNGZkMjRiZmZmYzQwMDE0MTEwMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwZmZkYTAwMDgwMTAyMDEwMTNmMDAzZmZmYzQwMDE1MTEwMTAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxMTBmZmRhMDAwODAxMDMwMTAxM2YwMDE5ZmZkOQ==';
        
        const uploadedFileBase64 = Buffer.from(uploadedRenditions["/MyRendition.jpeg"]).toString('base64');
        
        assert.ok(expected_rendtion  === uploadedFileBase64);

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[1].postProcessingDuration, receivedMetrics[1].processingDuration);
    });


    it('should download source, invoke worker in batch callback and upload rendition - same rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
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

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration, receivedMetrics[1].callbackProcessingDuration, receivedMetrics[2].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].callbackProcessingDuration + receivedMetrics[3].postProcessingDuration, receivedMetrics[3].processingDuration);
        // Fix when refactor timers: in batch worker, every rendition's currentPostProcessing duration equal to the last rendition's currentPostProcessing duration
        // fix is to set `this.timers.currentPostProcessing` = `this.timers.postProcessing` after for each rendition loop. 
        // This is not possible currently because `this.timers.postProcessing` is not a Timer, but a duration
        assert.equal(receivedMetrics[0].postProcessingDuration, receivedMetrics[1].postProcessingDuration, receivedMetrics[2].postProcessingDuration);
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
                fmt: "tiff",
                target: "https://example.com/MyRendition3.tiff"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG = true;
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "png");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "tiff");

        const uploadedFileBase64_png = Buffer.from(uploadedRenditions["/MyRendition1.png"]).toString('base64');
        const uploadedFileBase64_jpg = Buffer.from(uploadedRenditions["/MyRendition2.jpeg"]).toString('base64');
        const uploadedFileBase64_tiff = Buffer.from(uploadedRenditions["/MyRendition3.tiff"]).toString('base64');
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_jpg);
        assert.ok(BASE64_RENDITION_PNG  === uploadedFileBase64_png);        
        assert.ok(BASE64_RENDITION_TIFF  === uploadedFileBase64_tiff);
    });

});
