/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2019 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { worker, batchWorker } = require('../lib/api');

const testUtil = require('./testutil');
const assert = require('assert');
const fs = require('fs-extra');
const { SourceUnsupportedError, SourceFormatUnsupportedError, SourceCorruptError } = require('@nui/asset-compute-commons');
const mockFs = require('mock-fs');

// TODO: test result
//       - redact credentials
//       - info present
// TODO: test logging
//       - redact credentials
// TODO: test metrics sent

describe("api.js", () => {
    beforeEach(() => {
        testUtil.beforeEach();
    });

    afterEach(() => {
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
            assert.equal(typeof main, "function");

            const result = main(testUtil.simpleParams());
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                assert.equal(typeof source, "object");
                assert.equal(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                assert.equal(fs.readFileSync(source.path), testUtil.SOURCE_CONTENT);
                sourcePath = source.path;

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.path, "string");
                assert.equal(typeof rendition.name, "string");
                assert.equal(typeof rendition.directory, "string");
                assert.ok(!fs.existsSync(rendition.path));
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                renditionPath = rendition.path;
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            await main(testUtil.simpleParams());

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_created event should be sent', async () => {
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

            await main(params);

            testUtil.assertNockDone();
        });

        it('rendition_failed event with generic error should be sent due to worker function failure', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true, noMetricsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('error', {
                location: "test_action_process"
            });
            testUtil.nockNewRelicMetrics('activation');

            await main(params);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with generic error should be sent due to upload failure', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true, noMetricsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('error', {
                location:'test_action_processRendition'
            });
            testUtil.nockNewRelicMetrics('activation');

            await main(params);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with unsupported source error should be sent', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceUnsupportedError('The source is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true, noMetricsNock:true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceUnsupported",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('client_error', {
                reason: "SourceUnsupported",
                message: "The source is not supported"

            });
            testUtil.nockNewRelicMetrics('activation');

            await main(params);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with source corrupt error should be sent', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceCorruptError('The source file is corrupt'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true, noMetricsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceCorrupt",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('client_error', {
                reason: "SourceCorrupt",
                message: "The source file is corrupt"

            });
            testUtil.nockNewRelicMetrics('activation');

            await main(params);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with source format unsupported error should be sent', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceFormatUnsupportedError('The source format is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ noPut: true, noEventsNock: true, noMetricsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "SourceFormatUnsupported",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('client_error', {
                reason: "SourceFormatUnsupported",
                message: "The source format is not supported"

            });
            testUtil.nockNewRelicMetrics('activation');

            await main(params);

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('rendition_failed event with download failure', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject(new SourceFormatUnsupportedError('The source format is not supported'));
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ failDownload: true, noPut: true, noEventsNock: true, noMetricsNock: true });

            testUtil.nockIOEvent({
                type: "rendition_failed",
                errorReason: "GenericError",
                rendition: {
                    fmt: "png"
                },
                source: "https://example.com/MySourceFile.jpg"
            });

            testUtil.nockNewRelicMetrics('error', {
                location: "test_action_download",
                message: "GET 'https://example.com/MySourceFile.jpg' failed with status 500",

            });
            testUtil.nockNewRelicMetrics('activation');

            try {
                await main(params);
            } catch (err) {
                console.log(err);
            }

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should support the disableSourceDownload flag', async () => {
            function workerFn(source, rendition) {
                assert.equal(typeof source, "object");
                assert.equal(typeof source.path, "string");
                // must not download
                assert.ok(!fs.existsSync(source.path));

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.path, "string");
                assert.equal(typeof rendition.name, "string");
                assert.equal(typeof rendition.directory, "string");
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn, { disableSourceDownload: true});
            await main(testUtil.simpleParams({noSourceDownload: true}));

            testUtil.assertNockDone();
        });

        it('should handle multiple renditions', async () => {
            let sourcePath, renditionDir;

            function workerFn(source, rendition) {
                assert.equal(typeof source, "object");
                assert.equal(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                assert.equal(fs.readFileSync(source.path), testUtil.SOURCE_CONTENT);
                sourcePath = source.path;

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.path, "string");
                assert.equal(typeof rendition.name, "string");
                assert.equal(typeof rendition.directory, "string");
                assert.ok(!fs.existsSync(rendition.path));
                assert.ok(fs.existsSync(rendition.directory));
                assert.ok(fs.statSync(rendition.directory).isDirectory());
                renditionDir = rendition.directory;

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            await main(testUtil.paramsWithMultipleRenditions());

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it("should throw an error object if source download fails", async () => {
            const main = worker(function() {});

            await assert.rejects(
                main(testUtil.simpleParams({failDownload: true})),
                (err) => {
                    // should have a message
                    assert.notStrictEqual(err.message, undefined);
                    // should have params
                    assert.notStrictEqual(err.params, undefined);
                    return true;
                }
            );
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
            assert.equal(typeof main, "function");

            const result = main(testUtil.simpleParams());
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            let sourcePath, renditionPath, renditionDir;

            function batchWorkerFn(source, renditions, outDirectory) {
                assert.equal(typeof source, "object");
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

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            await main(testUtil.simpleParams());

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionPath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should support the disableSourceDownload flag', async () => {
            function batchWorkerFn(source, renditions, outDirectory) {
                assert.equal(typeof source, "object");
                assert.equal(typeof source.path, "string");
                // must not download
                assert.ok(!fs.existsSync(source.path));

                assert.ok(Array.isArray(renditions));
                assert.equal(renditions.length, 1);
                const rendition = renditions[0];
                assert.equal(typeof rendition.path, "string");
                assert.equal(typeof rendition.name, "string");
                assert.equal(typeof outDirectory, "string");
                assert.ok(fs.existsSync(outDirectory));
                assert.ok(fs.statSync(outDirectory).isDirectory());
                assert.ok(!fs.existsSync(rendition.path));

                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn, { disableSourceDownload: true});
            await main(testUtil.simpleParams({noSourceDownload: true}));

            testUtil.assertNockDone();
        });

        it('should send metrics - rendition and activation with cgroup metrics', async () => {
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
                await sleep(200);
                return Promise.resolve();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams();
            await main(params);

            testUtil.assertNockDone();
        });

        it('verify events with some successful and some not generated rendtions during processing', async () => {
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
            await main(testUtil.paramsWithMultipleRenditions({ noPut2: true, noEventsNock: true }));
            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify events with some successful and some failing during uploading', async () => {
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
            await main(testUtil.paramsWithMultipleRenditions({ put2Status: 400, noEventsNock: true}));

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify all error events with batch processing failing on second rendition', async () => {
            let sourcePath, renditionDir;

            async function batchWorkerFn(source, renditions) {
                let i = 0;
                for (const rendition of renditions) {
                    if (i !== 1) {
                        fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                    } else {
                        throw new Error('unexpected error occurred in worker')
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
            await main(testUtil.paramsWithMultipleRenditions({
                noPut1: true,
                noPut2: true,
                noPut3: true,
                noEventsNock: true
            }));

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify get all rendition failed events on download failure', async () => {
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
            await main(testUtil.paramsWithMultipleRenditions({
                noSourceDownload: true,
                noPut1: true,
                noPut2: true,
                noPut3: true,
                noEventsNock: true
            }));

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('should handle multiple renditions', async () => {
            let sourcePath, renditionDir;

            function batchWorkerFn(source, renditions, outDirectory) {
                assert.equal(typeof source, "object");
                assert.equal(typeof source.path, "string");
                assert.ok(fs.existsSync(source.path));
                assert.equal(fs.readFileSync(source.path), testUtil.SOURCE_CONTENT);
                sourcePath = source.path;

                assert.ok(Array.isArray(renditions));
                assert.equal(renditions.length, 3);

                for (const rendition of renditions) {
                    assert.equal(typeof rendition.path, "string");
                    assert.equal(typeof rendition.name, "string");
                    assert.equal(typeof outDirectory, "string");
                    assert.ok(fs.existsSync(outDirectory));
                    assert.ok(fs.statSync(outDirectory).isDirectory());
                    assert.ok(!fs.existsSync(rendition.path));
                    if (renditionDir !== undefined) {
                        assert.equal(rendition.directory, renditionDir);
                    }
                    renditionDir = rendition.directory;

                    fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
                }
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            await main(testUtil.paramsWithMultipleRenditions());

            testUtil.assertNockDone();

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it("should throw an error object if source download fails", async () => {
            const main = batchWorker(function() {});
            await assert.rejects(
                main(testUtil.simpleParams({failDownload: true})),
                (err) => {
                    // should have a message
                    assert.notStrictEqual(err.message, undefined);
                    // should have params
                    assert.notStrictEqual(err.params, undefined);
                    return true;
                }
            );
        });
    });
});
