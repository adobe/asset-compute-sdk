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

const { worker, batchWorker, bashScriptWorker } = require('../lib/api');

const testUtil = require('./testutil');
const assert = require('assert');
const fs = require('fs-extra');
const nock = require('nock');
const { SourceUnsupportedError, SourceFormatUnsupportedError, SourceCorruptError } = require('@nui/asset-compute-commons');
/*

example code

exports.main = worker(async (source, rendition, outdir) => {
    // impl
});

exports.main = batchWorker(async (source, renditions, outdir) => {
    // impl
});

*/

describe("api.js", () => {
    beforeEach(() => {
        testUtil.beforeEach();
    });

    afterEach(() => {
        testUtil.afterEach();
    });

    describe("worker()", () => {

        it("should throw if worker callback is invalid", () => {
            try {
                worker("string");
                assert.fail("no error thrown if callback is a string");
            } catch (e) {
            }
            try {
                worker();
                assert.fail("no error thrown if no callback given");
            } catch (e) {
            }
            try {
                worker({});
                assert.fail("no error thrown if argument is object");
            } catch (e) {
            }
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

            assert(nock.isDone());

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
            const params = testUtil.simpleParams();
            await main(params);

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_created');
            assert.strictEqual(json.rendition.fmt, 'png');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.strictEqual(json.metadata['repo:size'], testUtil.RENDITION_CONTENT.length);

            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

            assert(nock.isDone());
        });

        it('rendition_failed event with generic error should be sent due to upload failure', async () => {
            let sourcePath, renditionPath, renditionDir;

            function workerFn(source, rendition) {
                sourcePath = source.path;
                renditionPath = rendition.path;
                renditionDir = rendition.directory;
                return Promise.reject();
            }

            const main = worker(workerFn);
            const params = testUtil.simpleParams({ "noPut": true });
            await main(params);

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            console.log(json);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.errorReason, 'GenericError');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

            assert(nock.isDone());

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
            const params = testUtil.simpleParams({ "noPut": true });
            await main(params);

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            console.log(json);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.errorReason, 'SourceUnsupported');  
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');

            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

            assert(nock.isDone());

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
            const params = testUtil.simpleParams({ "noPut": true });
            await main(params);

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            console.log(json);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.errorReason, 'SourceCorrupt');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

            assert(nock.isDone());

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
            const params = testUtil.simpleParams({ "noPut": true });
            await main(params);

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            console.log(json);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.errorReason, 'SourceFormatUnsupported');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

            assert(nock.isDone());

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
            const params = testUtil.simpleParams({ failDownload: true, noPut: true });

            try {
                await main(params);
            } catch (err) {
                console.log(err);
            }

            const jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            const json = JSON.parse(jsonString);
            console.log(json);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.errorReason, 'GenericError');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 1);

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

            assert(nock.isDone());
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

            assert(nock.isDone());

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it("should throw an error object if source download fails", async () => {
            const main = worker(function() {});
            try {
                await main(testUtil.paramsWithFailingSourceDownload());
                assert.fail("did not throw");
            } catch (e) {
                // should have a message
                assert.notStrictEqual(e.message, undefined);
                // should have params
                assert.notStrictEqual(e.params, undefined);
            }
        });

        // TODO: more error tests
        //       - process fails
        //       - upload fails
        //       - one out of multiple renditions fails process
        //       - one out of multiple renditions fails upload
        // TODO: test result
        //       - redact credentials
        //       - info present
        // TODO: test logging
        //       - redact credentials
        // TODO: test events sent
        // TODO: test metrics sent
    });

    describe("batchWorker()", () => {

        it("should throw if batchWorker callback is invalid", () => {
            try {
                batchWorker("string");
                assert.fail("no error thrown");
            } catch (e) {
            }
            try {
                batchWorker();
                assert.fail("no error thrown if no callback given");
            } catch (e) {
            }
            try {
                batchWorker({});
                assert.fail("no error thrown if argument is object");
            } catch (e) {
            }
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

            assert(nock.isDone());

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

            assert(nock.isDone());
        });

        it('verify events with some successful and some failing during processing', async () => {
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

            const main = batchWorker(batchWorkerFn);
            await main(testUtil.paramsWithMultipleRenditions());

            let jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            console.log(jsonString);
            let json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_created');
            assert.strictEqual(json.rendition.fmt, 'png');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.strictEqual(json.metadata['repo:size'], testUtil.RENDITION_CONTENT.length);

            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event1.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_failed');
            assert.strictEqual(json.rendition.fmt, 'txt');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');

            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event2.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_created');
            assert.strictEqual(json.rendition.fmt, 'xml');
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');
            assert.strictEqual(json.metadata['repo:size'], testUtil.RENDITION_CONTENT.length);

            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 3);

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

            const main = batchWorker(batchWorkerFn);
            await main(testUtil.paramsWithMultipleRenditions({ put2Status: 400}));

            let jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            console.log(jsonString);
            let json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_created');

            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event1.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.source, 'https://example.com/MySourceFile.jpg');

            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event2.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_created');

            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 3);

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });

        it('verify get all rendition failed events on download failure', async () => {
            let sourcePath, renditionDir;

            function batchWorkerFn() {
                return Promise.resolve();
            }

            const main = batchWorker(batchWorkerFn);
            await main(testUtil.paramsWithMultipleRenditions({ noSourceDownload: true }));

            let jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event0.json`, 'utf8');
            console.log(jsonString);
            let json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_failed');
            
            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event1.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_failed');

            jsonString = fs.readFileSync(`${process.env.NUI_UNIT_TEST_OUT}/events/event2.json`, 'utf8');
            console.log(jsonString);
            json = JSON.parse(jsonString);
            assert.strictEqual(json.type, 'rendition_failed');
            
            assert.equal(fs.readdirSync(`${process.env.NUI_UNIT_TEST_OUT}/events`).length, 3);

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

            assert(nock.isDone());

            // ensure cleanup
            assert.ok(!fs.existsSync(sourcePath));
            assert.ok(!fs.existsSync(renditionDir));
        });
        it("should throw an error object if source download fails", async () => {
            const main = batchWorker(function() {});
            try {
                await main(testUtil.paramsWithFailingSourceDownload());
                assert.fail("did not throw");
            } catch (e) {
                // should have a message
                assert.notStrictEqual(e.message, undefined);
                // should have params
                assert.notStrictEqual(e.params, undefined);
            }
        });
    });

    describe("bashScriptWorker()", () => {

        it("should run a shell script", () => {
            bashScriptWorker();
        });
    });
});
