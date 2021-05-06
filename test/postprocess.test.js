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

const mockRequire = require("mock-require");
const { MetricsTestHelper } = mockRequire.reRequire("@adobe/asset-compute-commons");
const assert = require('assert');
const mockFs = require('mock-fs');
const fs = require('fs-extra');
const testUtil = require('./testutil');

// mock-required below in before()
let worker, batchWorker, shellScriptWorker;

const PNG_FILE = "test/files/fileSmall.png";

const RENDITION_JPG_PATH = "test/files/generatedFileSmall.jpg";
const RENDITION_PNG_PATH = "test/files/generatedFileSmall.png";
const RENDITION_TIFF_PATH = "test/files/generatedFileSmall.tiff";
const RENDITION_JPG = fs.readFileSync(RENDITION_JPG_PATH);
const RENDITION_PNG = fs.readFileSync(RENDITION_PNG_PATH);
const RENDITION_TIFF = fs.readFileSync(RENDITION_TIFF_PATH);

describe("postprocessing/image.js", () => {
    before(() => {
        const { needsImagePostProcess, prepareImagePostProcess } = require("../lib/postprocessing/image");
        mockRequire("../lib/postprocessing/image", {
            imagePostProcess: async function(intermediateRendition, rendition) {
                console.log('mocked image post processing', intermediateRendition.path, rendition.path);
                const instructions = rendition.instructions;
                if (instructions.shouldFail) {
                    throw new Error('mocked failure');
                } else if (instructions.fmt === 'jpg') {
                    await fs.copyFile(RENDITION_JPG_PATH, rendition.path);
                } else if (instructions.fmt === 'png') {
                    await fs.copyFile(RENDITION_PNG_PATH, rendition.path);
                } else if (instructions.fmt === 'tiff') {
                    await fs.copyFile(RENDITION_TIFF_PATH, rendition.path);
                } else {
                    throw new Error('unknown error');
                }
            },
            needsImagePostProcess: needsImagePostProcess,
            prepareImagePostProcess: prepareImagePostProcess
        });
        mockRequire.reRequire('../lib/worker'); // '../lib/postprocessing/image.js' is a dependency of lib/worker.js so it must be reloaded
        mockRequire.reRequire('../lib/shell/shellscript');
        const api = mockRequire.reRequire('../lib/api');
        worker = api.worker;
        batchWorker = api.batchWorker;
        shellScriptWorker = api.shellScriptWorker;
    });

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

    after(() => {
        mockRequire.stop('../lib/postprocessing/image');
    });

    afterEach(() => {
        testUtil.afterEach();
        delete process.env.WORKER_BASE_DIRECTORY;
        fs.removeSync("worker.sh");
    });

    it('should convert PNG to JPG - end to end test', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const base64PngFile = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAGCAIAAAEClagHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAGUmlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDUgNzkuMTYzNDk5LCAyMDE4LzA4LzEzLTE2OjQwOjIyICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOmRjPSJodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLyIgeG1sbnM6cGhvdG9zaG9wPSJodHRwOi8vbnMuYWRvYmUuY29tL3Bob3Rvc2hvcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgMjAxOSAoTWFjaW50b3NoKSIgeG1wOkNyZWF0ZURhdGU9IjIwMjAtMDEtMDhUMDg6MzE6NTktMDg6MDAiIHhtcDpNb2RpZnlEYXRlPSIyMDIwLTAxLTA4VDA5OjAxOjMyLTA4OjAwIiB4bXA6TWV0YWRhdGFEYXRlPSIyMDIwLTAxLTA4VDA5OjAxOjMyLTA4OjAwIiBkYzpmb3JtYXQ9ImltYWdlL3BuZyIgcGhvdG9zaG9wOkNvbG9yTW9kZT0iMyIgcGhvdG9zaG9wOklDQ1Byb2ZpbGU9InNSR0IgSUVDNjE5NjYtMi4xIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOmZkZWZjZjVhLTYyZTYtNGI1YS04ZDQ5LWY3YjIxYTY1YmZmOSIgeG1wTU06RG9jdW1lbnRJRD0iYWRvYmU6ZG9jaWQ6cGhvdG9zaG9wOjkzNGMxY2I0LWI0MGYtNjg0ZS04YTI5LWViNGRjNGZlNTBlNyIgeG1wTU06T3JpZ2luYWxEb2N1bWVudElEPSJ4bXAuZGlkOjVjOTAzY2RkLTBiMDgtNGNkMS04ZGFkLTA3ZjhiNTY3MzVmZSI+IDx4bXBNTTpIaXN0b3J5PiA8cmRmOlNlcT4gPHJkZjpsaSBzdEV2dDphY3Rpb249ImNyZWF0ZWQiIHN0RXZ0Omluc3RhbmNlSUQ9InhtcC5paWQ6NWM5MDNjZGQtMGIwOC00Y2QxLThkYWQtMDdmOGI1NjczNWZlIiBzdEV2dDp3aGVuPSIyMDIwLTAxLTA4VDA4OjMxOjU5LTA4OjAwIiBzdEV2dDpzb2Z0d2FyZUFnZW50PSJBZG9iZSBQaG90b3Nob3AgQ0MgMjAxOSAoTWFjaW50b3NoKSIvPiA8cmRmOmxpIHN0RXZ0OmFjdGlvbj0iY29udmVydGVkIiBzdEV2dDpwYXJhbWV0ZXJzPSJmcm9tIGltYWdlL2JtcCB0byBpbWFnZS9wbmciLz4gPHJkZjpsaSBzdEV2dDphY3Rpb249InNhdmVkIiBzdEV2dDppbnN0YW5jZUlEPSJ4bXAuaWlkOmZkZWZjZjVhLTYyZTYtNGI1YS04ZDQ5LWY3YjIxYTY1YmZmOSIgc3RFdnQ6d2hlbj0iMjAyMC0wMS0wOFQwOTowMTozMi0wODowMCIgc3RFdnQ6c29mdHdhcmVBZ2VudD0iQWRvYmUgUGhvdG9zaG9wIENDIDIwMTkgKE1hY2ludG9zaCkiIHN0RXZ0OmNoYW5nZWQ9Ii8iLz4gPC9yZGY6U2VxPiA8L3htcE1NOkhpc3Rvcnk+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+saBMWgAAAMtJREFUCJkBwAA//wECAgQGBh0AAgMIAZXZ+Bjr4sDH3QAEBAYAAA8Btdrz5NPSAQkLNPcJHQQkLEhMRCUqGAEDAwUAAAIBAgf8+wYKChcE/wo6/hUmFC8tYVpMHyEQAa3h+wLt7Pvs6NTf7u7u+AEDAg3//wIBAAUCAgcAAQj7/AQRGR4DDBHs7PsAGRoBFVqbGSIgJSEYIBsTGRINGxIJFQf/DwT+CwMA/fb5AZSszuPl7u/18xII+w4G/Pj7+fz9/+/3/f79ABQKBbEURiSAy6U8AAAAAElFTkSuQmCC";
        const main = worker(workerFn, { supportedRenditionFormats: ["jpg"] });
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

        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition.jpeg"]));

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[1].postProcessingDuration, receivedMetrics[1].processingDuration);
        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
    }).timeout(5000);

    it('should fail if rendition failed in post processing - single rendition ', async () => {
        //batchworker single rendition post process eligible
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = worker(workerFn, { supportedRenditionFormats: ["jpg"] });
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpeg",
                shouldFail: true
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors);
        assert.ok(result.renditionErrors[0].message.includes('mocked failure'));

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_failed");
        assert.equal(events[0].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "error");
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.ok(receivedMetrics[0].callbackProcessingDuration > 0, receivedMetrics[0].postProcessingDuration > 0, receivedMetrics[0].processingDuration > 0);
        assert.ok(receivedMetrics[1].callbackProcessingDuration > 0, receivedMetrics[1].postProcessingDuration > 0, receivedMetrics[1].processingDuration > 0);
        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
    });

    it('should download source, invoke worker in batch callback and upload rendition - same rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        async function batchWorkerFn(source, renditions, outDirectory) {
            assert.equal(typeof source, "object");
            assert.equal(typeof source.path, "string");
            assert.ok(fs.existsSync(source.path));

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
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn, { supportedRenditionFormats: ["jpg"] });
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

        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition1.jpeg"]));
        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition2.jpeg"]));
        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition3.jpeg"]));

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration, receivedMetrics[1].callbackProcessingDuration, receivedMetrics[2].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].callbackProcessingDuration + receivedMetrics[3].postProcessingDuration, receivedMetrics[3].processingDuration);
        assert.equal(receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration + receivedMetrics[2].postProcessingDuration, receivedMetrics[3].postProcessingDuration);

        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
        assert.equal(receivedMetrics[2].imagePostProcess, true);
        assert.equal(receivedMetrics[3].imagePostProcess, true);
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
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn, { supportedRenditionFormats: ["jpg", "png", "tiff"] });
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "png",
                dpi: 10, // dummy to ensure post processing runs
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

        assert.ok(RENDITION_PNG.equals(uploadedRenditions["/MyRendition1.png"]));
        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition2.jpeg"]));
        assert.ok(RENDITION_TIFF.equals(uploadedRenditions["/MyRendition3.tiff"]));
    });

    it('should fail rendition only for failed post processing but success for others - multiple rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn, { supportedRenditionFormats: ["jpg"] });
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
                target: "https://example.com/MyRendition3.jpeg",
                shouldFail: true
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors);
        console.log(result.renditionErrors[0].message);
        assert.ok(result.renditionErrors[0].message.includes('mocked failure'));
        assert.equal(result.renditionErrors.length, 1);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_failed");
        assert.equal(events[2].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[2].eventType, "error");
        assert.equal(receivedMetrics[2].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].postProcessingDuration, receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration
                                + receivedMetrics[2].postProcessingDuration);

        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
        assert.equal(receivedMetrics[2].imagePostProcess, true);
        assert.equal(receivedMetrics[3].imagePostProcess, true);
    });

    it('should post process eligible rendition and skip others - multiple rendition', async () => {
        //batchworker multiple rendition not all post process eligible
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn, { supportedRenditionFormats: ["jpg", "pdf"] });
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition1.jpeg"
            },{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
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
        assert.equal(events[1].rendition.fmt, "pdf");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[1].postProcessingDuration, receivedMetrics[1].processingDuration);
        assert.equal(receivedMetrics[2].eventType, "rendition");
        assert.equal(receivedMetrics[2].callbackProcessingDuration + receivedMetrics[2].postProcessingDuration, receivedMetrics[2].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].postProcessingDuration, receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration
                            + receivedMetrics[2].postProcessingDuration);

        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.ok(!receivedMetrics[1].imagePostProcess);
        assert.equal(receivedMetrics[2].imagePostProcess, true);
        assert.equal(receivedMetrics[3].imagePostProcess, true);
    });

    it('should generate rendition if only one post processing ineligible rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "pdf",
                target: "https://example.com/MyRendition2.jpeg"
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
        assert.equal(events[0].rendition.fmt, "pdf");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[1].postProcessingDuration, receivedMetrics[0].postProcessingDuration);
        assert.equal(receivedMetrics[1].processingDuration, receivedMetrics[0].processingDuration);
        assert.ok(!receivedMetrics[0].imagePostProcess);
        assert.ok(!receivedMetrics[1].imagePostProcess);
    });

    it('should generate rendition if only one post processing eligible rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn, { supportedRenditionFormats: ["jpg"] });
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
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

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[1].postProcessingDuration, receivedMetrics[0].postProcessingDuration);
        assert.equal(receivedMetrics[1].processingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
    });

    it('should generate rendition when all rendition are post processing ineligible', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
            },{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 2);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "pdf");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "pdf");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 3);
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[2].eventType, "activation");
        assert.equal(receivedMetrics[2].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.ok(!receivedMetrics[0].imagePostProcess);
        assert.ok(!receivedMetrics[1].imagePostProcess);
        assert.ok(!receivedMetrics[2].imagePostProcess);
    });

    it("should post process after shellScriptWorker(), json postProcess is boolean", async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        const script = `
        cp $source $rendition
        echo '{ "postProcess": true }' > $optionsfile
        `;
        await fs.writeFile("worker.sh", script);

        const main = shellScriptWorker("worker.sh", { supportedRenditionFormats: ["jpg"] });

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
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

        // validate no errors
        assert.ok(result.renditionErrors === undefined);

        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition.jpeg"]));

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");

        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 2);
        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
    });

    it("should post process after shellScriptWorker(), json postProcess is string", async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        const script = `
        cp $source $rendition
        echo '{ "postProcess": "true" }' > $optionsfile
        `;
        await fs.writeFile("worker.sh", script);

        const main = shellScriptWorker("worker.sh", { supportedRenditionFormats: ["jpg"] });

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
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

        // validate no errors
        assert.ok(result.renditionErrors === undefined);

        assert.ok(RENDITION_JPG.equals(uploadedRenditions["/MyRendition.jpeg"]));

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");

        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 2);
        assert.equal(receivedMetrics[0].imagePostProcess, true);
        assert.equal(receivedMetrics[1].imagePostProcess, true);
    });

    it("should fail if options.json from shellScriptWorker() is not formatted correctly", async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        const script = `
        cp $source $rendition
        echo 'hello world' > $optionsfile
        `;
        await fs.writeFile("worker.sh", script);

        const main = shellScriptWorker();

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
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

        const result = await main(params, {supportedRenditionFormats: ["jpg"]});

        // validate no errors
        assert.strictEqual(result.renditionErrors.length, 1);

        // make sure it did not do post processing
        assert.deepEqual(uploadedRenditions, {});
        // assert.ok(!RENDITION_JPG.equals(uploadedRenditions["/MyRendition.jpeg"]));

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_failed");
        assert.equal(events[0].rendition.fmt, "jpg");

        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 2);
        assert.ok(!receivedMetrics[0].imagePostProcess);
        assert.ok(!receivedMetrics[1].imagePostProcess);
    });
});
