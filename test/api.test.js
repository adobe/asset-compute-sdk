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
const mockFs = require('mock-fs');

const { worker, batchWorker } = require('../lib/api');

const testUtil = require('./testutil');
const fs = require('fs-extra');
const { SourceUnsupportedError, SourceFormatUnsupportedError, SourceCorruptError } = require('@adobe/asset-compute-commons');
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");
const sleep = require('util').promisify(setTimeout);
const sinon = require('sinon');

const TIMEOUT_EXIT_CODE = 101;
let processSpy;

describe("api.js", () => {
    beforeEach(function() {
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        process.env.DISABLE_IO_EVENTS_ON_TIMEOUT = true;
        processSpy = sinon.stub(process, 'exit').withArgs(TIMEOUT_EXIT_CODE);
        testUtil.beforeEach();
    });

    afterEach(() => {
        delete process.env.__OW_DEADLINE;
        delete process.env.DISABLE_IO_EVENTS_ON_TIMEOUT;
        delete process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS;
        process.exit.restore();
        testUtil.afterEach();
    });
    describe("worker()", () => {

        it("should throw if worker callback is invalid", async () => {
            await testUtil.assertThrowsAndAwait(() => worker(), "no error thrown if no callback given");
            await testUtil.assertThrowsAndAwait(() => worker("string"), "no error thrown if incorrect callback given");
            await testUtil.assertThrowsAndAwait(() => worker({}), "no error thrown if incorrect callback given");
        });

        it("should return a function that returns a promise", async () => {
            const main = worker(function() {});
            assert.strictEqual(typeof main, "function");

            MetricsTestHelper.mockNewRelic();

            const result = main(testUtil.simpleParams());
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.strictEqual(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));

                /* eslint-disable eqeqeq */
                // we can only do a weakly typed check here
                assert.ok(fs.readFileSync(source.path) == testUtil.SOURCE_CONTENT);
                /* eslint-enable eqeqeq */

                sourcePath = source.path;

                assert.strictEqual(typeof rendition, "object");
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof rendition.directory, "string");
                assert.ok(!fs.existsSync(rendition.path));
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                renditionPath = rendition.path;
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const result = await main(testUtil.simpleParams());

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            testUtil.assertNockDone();
            await testUtil.assertSimpleParamsMetrics(receivedMetrics);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_created event should be sent', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(source, rendition) {
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({noEventsNock: true});

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg",
                metadata: {
                    "repo:size": testUtil.RENDITION_CONTENT.length
                }
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            testUtil.assertNockDone();
            await testUtil.assertSimpleParamsMetrics(receivedMetrics, {noEventsNock: true});
        });

        it('should send rendition_created event with source as a content fragment (data uri)', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(source, rendition) {
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({noEventsNock: true, sourceIsDataUri: true, noSourceDownload:true});

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png"
                },
                source: "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=",
                metadata: {
                    "repo:size": testUtil.RENDITION_CONTENT.length
                }
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it('rendition_failed event with generic error should be sent due to worker function failure', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject("failed");
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0], "failed");

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                location: "test_action_process"
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with generic error should be sent due to upload failure', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ failUpload: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "GenericError");
            assert.strictEqual(result.renditionErrors[0].location, "test_action_upload");
            assert.ok(result.renditionErrors[0].message.includes("500")); // failUpload above returns 500 error

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                fmt: "png",
                location: "test_action_upload",
                requestId: "test-request-id"
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with generic error should be sent if no rendition was generated', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "GenericError");
            assert.strictEqual(result.renditionErrors[0].location, "test_action_process_norendition");
            // TODO: fix error handling, currently the message is "GenericError: No rendition generated for 0"
            // assert.ok(result.renditionErrors[0].message.includes("500")); // failUpload above returns 500 error

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                location:'test_action_process_norendition'
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with unsupported source error should be sent', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceUnsupportedError('The source is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceUnsupported",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "SourceUnsupportedError");
            assert.strictEqual(result.renditionErrors[0].reason, "SourceUnsupported");

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "client_error",
                reason: "SourceUnsupported",
                message: "The source is not supported"
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with source corrupt error should be sent', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceCorruptError('The source file is corrupt'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceCorrupt",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "SourceCorruptError");
            assert.strictEqual(result.renditionErrors[0].reason, "SourceCorrupt");

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "client_error",
                reason: "SourceCorrupt",
                message: "The source file is corrupt"
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with source format unsupported error should be sent', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceFormatUnsupportedError('The source format is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceFormatUnsupported",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "SourceFormatUnsupportedError");
            assert.strictEqual(result.renditionErrors[0].reason, "SourceFormatUnsupported");

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "client_error",
                reason: "SourceFormatUnsupported",
                message: "The source format is not supported"
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with download failure', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceFormatUnsupportedError('The source format is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ failDownload: true, noPut: true, noEventsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            try {
                await main(params);
            } catch (err) {
                console.log(err);
            }

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                location: "test_action_download",
                message: "GET 'https://example.com/MySourceFile.jpg' failed with status 500",
            },{
                eventType: "activation"
            }]);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it("should send `timeout` and `error` metrics because of IO event failure", async () => {
            process.env.NODE_FETCH_RETRY_MAX_RETRY = 100;
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            }, 500).persist(); // persist for retries

            const main = worker(function(source, rendition) {
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            });
            assert.strictEqual(typeof main, "function");
            process.env.__OW_DEADLINE = Date.now() + 300;

            await main(testUtil.simpleParams({noEventsNock:true}));

            testUtil.assertNockDone();
            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: 'timeout'
            },{
                eventType: "error",
                message: "Error sending IO event: 500 Internal Server Error",
                location:"IOEvents"
            },{
                eventType: "rendition",
                requestId: "test-request-id",
                fmt: "png"
            },{
                eventType: "activation"
            }]);
        });

        it("should fail by timeout during rendition processing", async () => {
            delete process.env.DISABLE_IO_EVENTS_ON_TIMEOUT;
            process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;

            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const main = worker(async function() {
                await sleep(200);
            });
            assert.strictEqual(typeof main, "function");
            process.env.__OW_DEADLINE = Date.now() + 100;

            await main(testUtil.simpleParams({noEventsNock:true, noPut:true}));
            testUtil.assertNockDone();
            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: 'timeout'
            }]);
            assert.strictEqual(processSpy.calledOnce, true, "did not call process.exit(101) on timeout");
        });

        it("should fail by timeout during second rendition processing", async () => {
            delete process.env.DISABLE_IO_EVENTS_ON_TIMEOUT;
            process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: { fmt: 'xml', name: 'MyRendition3.xml' },
                source: "https://example.com/MySourceFile.jpg"
            });

            const main = worker(async function(source, rendition) {
                if (rendition.index === 2) {
                    console.log('waiting...');
                    await sleep(400);
                    return;
                }
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
            });
            assert.strictEqual(typeof main, "function");
            process.env.__OW_DEADLINE = Date.now() + 300;
            await main(testUtil.paramsWithMultipleRenditions({noPut3:true}));

            testUtil.assertNockDone();
            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: 'timeout'
            }]);
            assert.strictEqual(processSpy.calledOnce, true, "did not call process.exit(101) on timeout");
        }).timeout(7000);

        it('should support the disableSourceDownload flag', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(source, rendition) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.strictEqual(typeof source.url, "string");
                // must not download
                assert.ok(!fs.existsSync(source.path));

                assert.strictEqual(typeof rendition, "object");
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof rendition.directory, "string");
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn, { disableSourceDownload: true});
            await main(testUtil.simpleParams({noSourceDownload: true}));

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it('should send params to worker', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(source, rendition, params) {
                // check params
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof params, "object");
                assert.strictEqual(typeof params.auth, "object");
                assert.strictEqual(params.auth, testUtil.PARAMS_AUTH);
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            await main(testUtil.simpleParams());

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it('should handle multiple renditions', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            function workerFn(source, rendition) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                /* eslint-disable eqeqeq */
                assert.ok(fs.readFileSync(source.path) == testUtil.SOURCE_CONTENT);
                /* eslint-enable eqeqeq */

                sourcePath = source.path;

                assert.strictEqual(typeof rendition, "object");
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof rendition.directory, "string");
                assert.ok(!fs.existsSync(rendition.path));
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions());

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            testUtil.assertNockDone();
            await testUtil.assertParamsWithMultipleRenditions(receivedMetrics);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        }).timeout(60000);

        it("should throw an error object if source download fails", async () => {
            MetricsTestHelper.mockNewRelic();

            const main = worker(function() {});

            await assert.rejects(
                main(testUtil.simpleParams({failDownload: true})),
                (err) => {
                    // should have a message
                    assert.notStrictEqual(err.message, undefined);
                    return true;
                }
            );
        });

        it('should embed rendition in the io event', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            const embedBinaryLimit = 32 * 1024;

            function workerFn(source, rendition) {
                fs.writeFileSync(rendition.path, 'hello world');
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({noEventsNock: true, noPut: true});
            params.renditions[0].embedBinaryLimit = embedBinaryLimit;

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png",
                    embedBinaryLimit: embedBinaryLimit
                },
                data: 'data:application/octet-stream;base64,aGVsbG8gd29ybGQ=',
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            testUtil.assertNockDone();
            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "rendition",
                fmt: "png",
                renditionFormat: "png",
                requestId: "test-request-id"
            },{
                eventType: "activation"
            }]);
        });

        it('should not embed rendition in the io event if the rendition is too big', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            const embedBinaryLimit = 10;

            function workerFn(source, rendition) {
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({noEventsNock: true});
            params.renditions[0].embedBinaryLimit = embedBinaryLimit;

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png",
                    embedBinaryLimit: embedBinaryLimit
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const result = await main(params);

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            testUtil.assertNockDone();
            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
        });

    });

    describe("batchWorker()", () => {

        it("should throw if batchWorker callback is invalid", async () => {
            await testUtil.assertThrowsAndAwait(() => batchWorker(), "no error thrown if no callback given");
            await testUtil.assertThrowsAndAwait(() => batchWorker("string"), "no error thrown if incorrect callback given");
            await testUtil.assertThrowsAndAwait(() => batchWorker({}), "no error thrown if incorrect callback given");
        });

        it("should return a function that returns a promise", async () => {
            const main = batchWorker(function() {});
            assert.strictEqual(typeof main, "function");

            MetricsTestHelper.mockNewRelic();

            const result = main(testUtil.simpleParams());
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.strictEqual(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function batchWorkerFn(source, renditions, outDirectory) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                /* eslint-disable eqeqeq */
                assert.ok(fs.readFileSync(source.path) == testUtil.SOURCE_CONTENT);
                /* eslint-enable eqeqeq */
                sourcePath = source.path;

                assert.ok(Array.isArray(renditions));
                assert.strictEqual(renditions.length, 1);
                const rendition = renditions[0];
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof outDirectory, "string");
                assert.ok(fs.existsSync(outDirectory));
                assert.ok(fs.statSync(outDirectory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));
                renditionPath = rendition.path;
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.simpleParams());

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should support the disableSourceDownload flag', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function batchWorkerFn(source, renditions, outDirectory) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                // must not download
                assert.ok(!fs.existsSync(source.path));

                assert.ok(Array.isArray(renditions));
                assert.strictEqual(renditions.length, 1);
                const rendition = renditions[0];
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof outDirectory, "string");
                assert.ok(fs.existsSync(outDirectory));
                assert.ok(fs.statSync(outDirectory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn, { disableSourceDownload: true});
            await main(testUtil.simpleParams({noSourceDownload: true}));

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it('should send params to worker', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionPath, renditionDir;

            function batchWorkerFn(source, renditions, outDirectory, params) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                /* eslint-disable eqeqeq */
                assert.ok(fs.readFileSync(source.path) == testUtil.SOURCE_CONTENT);
                /* eslint-disable eqeqeq */
                sourcePath = source.path;

                // check params
                assert.strictEqual(typeof params, "object");
                assert.strictEqual(typeof params.auth, "object");
                assert.strictEqual(params.auth, testUtil.PARAMS_AUTH);

                assert.ok(Array.isArray(renditions));
                assert.strictEqual(renditions.length, 1);
                const rendition = renditions[0];
                assert.strictEqual(typeof rendition.path, "string");
                assert.strictEqual(typeof rendition.name, "string");
                assert.strictEqual(typeof outDirectory, "string");
                assert.ok(fs.existsSync(outDirectory));
                assert.ok(fs.statSync(outDirectory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));
                renditionPath = rendition.path;
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.simpleParams());

            // validate errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should send metrics - rendition and activation with cgroup metrics', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();
            mockFs({
                '/sys/fs/cgroup': {
                    'memory': {
                        'memory.stat':'cache 2453\nrss 1234\n',
                        'memory.kmem.usage_in_bytes':'5432',
                        'memory.limit_in_bytes': '9999'
                    },
                    'cpuacct': {
                        'cpuacct.usage': '1000',
                        'cpuacct.stat': 'user 2000\nsystem 3000\n'
                    }
                }
            });
            const { promisify } = require('util');
            const sleep = promisify(setTimeout);
            const writeFile = promisify(fs.writeFile);

            async function workerFn(source, rendition) {
                await writeFile(rendition.path, testUtil.RENDITION_CONTENT);
                await sleep(500);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams();
            await main(params);

            await MetricsTestHelper.metricsDone();
            testUtil.assertNockDone();

            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "rendition",
            },{
                eventType: "activation",
                "memory_containerUsage_min": 6666,
                "memory_containerUsage_max": 6666,
                "memory_containerUsage_mean": 6666,
                "memory_containerUsage_stdev": 0,
                "memory_containerUsage_median": 6666,
                "memory_containerUsage_q1": 6666,
                "memory_containerUsage_q3": 6666,
                "memory_containerUsagePercentage_min": 66.66666666666666,
                "memory_containerUsagePercentage_max": 66.66666666666666,
                "memory_containerUsagePercentage_mean": 66.66666666666666,
                "memory_containerUsagePercentage_stdev": 0,
                "memory_containerUsagePercentage_median": 66.66666666666666,
                "memory_containerUsagePercentage_q1": 66.66666666666666,
                "memory_containerUsagePercentage_q3": 66.66666666666666,
                "cpu_usagePercentage_min": 0,
                "cpu_usagePercentage_max": 0,
                "cpu_usagePercentage_mean": 0,
                "cpu_usagePercentage_stdev": 0,
                "cpu_usagePercentage_median": 0,
                "cpu_usagePercentage_q1": 0,
                "cpu_usagePercentage_q3": 0
            }]);
        });

        it('verify events with some successful and some not generated rendtions during processing', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            function batchWorkerFn(source, renditions) {
                let i = 0;
                for (const rendition of renditions) {
                    if (i !== 1) {
                        fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                    }
                    i++;
                }
                return Promise.resolve();
            }

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png",
                    name: "MyRendition1.png"
                },
                source: "https://example.com/MySourceFile.jpg",
                metadata: {
                    "repo:size": testUtil.RENDITION_CONTENT.length
                }
            });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "txt",
                    name: "MyRendition2.txt"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "xml",
                    name: "MyRendition3.xml"
                },
                source: "https://example.com/MySourceFile.jpg",
                metadata: {
                    "repo:size": testUtil.RENDITION_CONTENT.length
                }
            });

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions({ noPut2: true, noEventsNock: true }));

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "GenericError");
            assert.strictEqual(result.renditionErrors[0].location, "test_action_batchProcess_norendition");
            const msg = result.renditionErrors[0].message;
            assert.ok(msg.includes("MyRendition2.txt"));

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "rendition"
            },{
                eventType: "error",
                location: "test_action_batchProcess_norendition",
                fmt: "txt",
                name: "MyRendition2.txt",
                requestId: "test-request-id"
            },{
                eventType: "rendition",
            },{
                eventType: "activation",
            }]);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify events with some successful and some failing during uploading', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            function batchWorkerFn(source, renditions) {
                for (const rendition of renditions) {
                    fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                }
                return Promise.resolve();
            }

            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "png",
                    name: "MyRendition1.png",
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "txt",
                    name: "MyRendition2.txt"
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_created",
                rendition: {
                    fmt: "xml",
                    name: "MyRendition3.xml"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions({ put2Status: 400, noEventsNock: true}));

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 1);
            assert.strictEqual(result.renditionErrors[0].name, "GenericError");
            assert.strictEqual(result.renditionErrors[0].location, "test_action_upload");
            const msg = result.renditionErrors[0].message;
            assert.ok(msg.includes("MyRendition2.txt"));
            assert.ok(msg.includes("400")); // put2Status set to fail with 400

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "rendition"
            },{
                eventType: "error",
                location: "test_action_upload",
                fmt: "txt",
                name: "MyRendition2.txt",
                renditionName: "MyRendition2.txt",
                renditionFormat: "txt",
                requestId: "test-request-id"
            },{
                eventType: "rendition",
            },{
                eventType: "activation",
            }]);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify all error events with batch processing failing on second rendition', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            async function batchWorkerFn(source, renditions) {
                let i = 0;
                for (const rendition of renditions) {
                    if (i !== 1) {
                        fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                    } else {
                        throw new Error('unexpected error occurred in worker');
                    }
                    i++;
                }
            }

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png",
                    name: "MyRendition1.png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "txt",
                    name: "MyRendition2.txt"
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "xml",
                    name: "MyRendition3.xml"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions({
                noPut1: true,
                noPut2: true,
                noPut3: true,
                noEventsNock: true
            }));

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 3);
            assert.strictEqual(result.renditionErrors[0].name, "Error");
            assert.strictEqual(result.renditionErrors[0].message, "unexpected error occurred in worker");
            assert.strictEqual(result.renditionErrors[1].name, "Error");
            assert.strictEqual(result.renditionErrors[1].message, "unexpected error occurred in worker");
            assert.strictEqual(result.renditionErrors[2].name, "Error");
            assert.strictEqual(result.renditionErrors[2].message, "unexpected error occurred in worker");

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                location: "test_action_batchProcess",
                requestId: "test-request-id"
            },{
                eventType: "activation",
            }]);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify rendition_failed events sent if no rendition was generated for multiple renditions', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            function batchWorkerFn() {
                return Promise.resolve();
            }

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png",
                    name: "MyRendition1.png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "txt",
                    name: "MyRendition2.txt"
                },
                source: "https://example.com/MySourceFile.jpg"
            });
            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "xml",
                    name: "MyRendition3.xml"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions({
                noSourceDownload: true,
                noPut1: true,
                noPut2: true,
                noPut3: true,
                noEventsNock: true
            }));

            // validate errors
            assert.ok(result.renditionErrors);
            assert.strictEqual(result.renditionErrors.length, 3);
            assert.strictEqual(result.renditionErrors[0].name, "GenericError");
            assert.ok(result.renditionErrors[0].message.includes("MyRendition1.png"));
            assert.strictEqual(result.renditionErrors[1].name, "GenericError");
            assert.ok(result.renditionErrors[1].message.includes("MyRendition2.txt"));
            assert.strictEqual(result.renditionErrors[2].name, "GenericError");
            assert.ok(result.renditionErrors[2].message.includes("MyRendition3.xml"));

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                name: "MyRendition1.png",
                location: "test_action_batchProcess_norendition",
                requestId: "test-request-id"
            },{
                eventType: "error",
                name: "MyRendition2.txt",
                location: "test_action_batchProcess_norendition",
                requestId: "test-request-id"
            },{
                eventType: "error",
                name: "MyRendition3.xml",
                location: "test_action_batchProcess_norendition",
                requestId: "test-request-id"
            },{
                eventType: "activation",
            }]);
            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should handle multiple renditions', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            let sourcePath, renditionDir;

            function batchWorkerFn(source, renditions, outDirectory) {
                assert.strictEqual(typeof source, "object");
                assert.strictEqual(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                /* eslint-disable eqeqeq */
                assert.ok(fs.readFileSync(source.path) == testUtil.SOURCE_CONTENT);
                /* eslint-enable eqeqeq */
                sourcePath = source.path;

                assert.ok(Array.isArray(renditions));
                assert.strictEqual(renditions.length, 3);

                for (const rendition of renditions) {
                    assert.strictEqual(typeof rendition.path, "string");
                    assert.strictEqual(typeof rendition.name, "string");
                    assert.strictEqual(typeof outDirectory, "string");
                    assert.ok(fs.existsSync(outDirectory));
                    assert.ok(fs.statSync(outDirectory).isDirectory());
                    assert.ok(!fs.existsSync(rendition.path));
                    if (renditionDir !== undefined) {
                        assert.strictEqual(rendition.directory, renditionDir);
                    }
                    renditionDir = rendition.directory;

                    fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                }
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            const result = await main(testUtil.paramsWithMultipleRenditions());

            // validate errors 
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertParamsWithMultipleRenditions(receivedMetrics);
            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        }).timeout(60000);

        it("should throw an error object if source download fails", async () => {
            MetricsTestHelper.mockNewRelic();

            const main = batchWorker(function() {});
            await assert.rejects(
                main(testUtil.simpleParams({failDownload: true})),
                (err) => {
                    // should have a message
                    assert.notStrictEqual(err.message, undefined);
                    return true;
                }
            );
        });
    });
});
