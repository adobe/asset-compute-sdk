/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { forEachRendition, process } = require('../lib/compat');
const proc = require('process');
const testUtil = require('./testutil');
const fs = require('fs-extra');
const nock = require('nock');
const assert = require('assert');
const mockFs = require('mock-fs');
const MetricsTestHelper = require("@nui/openwhisk-newrelic/lib/testhelper");

describe('compat.js', () => {

    beforeEach(() => {
        testUtil.beforeEach();
    });

    afterEach( () => {
        testUtil.afterEach();
    });

    describe('forEachRendition()', () => {

        it("should throw if worker callback is invalid", async () => {
            await testUtil.assertThrowsAndAwait(() => forEachRendition(), "no error thrown if no callback given");
            await testUtil.assertThrowsAndAwait(() => forEachRendition("string"), "no error thrown if incorrect callback given");
            await testUtil.assertThrowsAndAwait(() => forEachRendition({}), "no error thrown if incorrect callback given");
        });

        it("should return a function that returns a promise", async () => {
            const result = forEachRendition(testUtil.simpleParams(), function(infile, rendition, outdir) {
                fs.writeFileSync(`${outdir}/${rendition.name}`, testUtil.RENDITION_CONTENT);
            });
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            try {
                await result;
            } catch(e) {}
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(infile, rendition, outdir) {
                assert.equal(typeof infile, "string");
                assert.ok(fs.existsSync(infile));
                assert.equal(fs.readFileSync(infile), testUtil.SOURCE_CONTENT);

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                assert.ok(!fs.existsSync(rendition.name));

                assert.equal(typeof outdir, "string");
                assert.ok(fs.existsSync(outdir));
                assert.ok(fs.statSync(outdir).isDirectory());

                fs.writeFileSync(`${outdir}/${rendition.name}`, testUtil.RENDITION_CONTENT);
            }

            await forEachRendition(testUtil.simpleParams(), workerFn);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            assert(nock.isDone());
        });

        it('should support the disableSourceDownloadSource flag', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(infile, rendition, outdir) {
                assert.strictEqual(typeof infile, "string");
                assert.strictEqual(infile, 'https://example.com/MySourceFile.jpg');
                // must not download
                assert.ok(!fs.existsSync(infile));

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                assert.ok(!fs.existsSync(rendition.name));

                assert.equal(typeof outdir, "string");
                assert.ok(fs.existsSync(outdir));
                assert.ok(fs.statSync(outdir).isDirectory());

                fs.writeFileSync(`${outdir}/${rendition.name}`, testUtil.RENDITION_CONTENT);
            }

            await forEachRendition(testUtil.simpleParams({noSourceDownload: true}), { disableSourceDownloadSource: true }, workerFn);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            assert(nock.isDone());
        });

        it('should support the disableSourceDownloadSource flag in WORKER_TEST_MODE', async () => {
            proc.env.WORKER_TEST_MODE = true;

			mockFs({ '/in/file.jpg': 'yo' });
            function workerFn(infile, rendition, outdir) {
                assert.strictEqual(typeof infile, "string");
                assert.strictEqual(infile, '/in/file.jpg');
                // must not download
                assert.ok(fs.existsSync(infile));

                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                assert.ok(!fs.existsSync(rendition.name));

                assert.equal(typeof outdir, "string");
                assert.ok(!fs.existsSync(outdir));

                mockFs({ '/out/rendition0.png': testUtil.RENDITION_CONTENT});
            }

            await forEachRendition({
                source: 'file.jpg',
                renditions: [Object.assign({
                    fmt: "png",
                    target: "https://example.com/MyRendition.png"
                })],
                requestId: "test-request-id",
            }, { disableSourceDownloadSource: true }, workerFn);

            assert(nock.isDone());
            delete proc.env.WORKER_TEST_MODE;
        });

    });

    describe('process()', () => {

        it("should throw if worker callback is invalid", async () => {
            await testUtil.assertThrowsAndAwait(() => process(), "no error thrown if no callback given");
            await testUtil.assertThrowsAndAwait(() => process("string"), "no error thrown if incorrect callback given");
            await testUtil.assertThrowsAndAwait(() => process({}), "no error thrown if incorrect callback given");
        });

        it("should return a function that returns a promise", async () => {
            const result = process(testUtil.simpleParams(), function(infile, renditions, outdir) {
                fs.writeFileSync(`${outdir}/${renditions[0].name}`, testUtil.RENDITION_CONTENT);
            });
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(infile, renditions, outdir) {
                assert.equal(typeof infile, "string");
                assert.ok(fs.existsSync(infile));
                assert.equal(fs.readFileSync(infile), testUtil.SOURCE_CONTENT);

                assert.ok(Array.isArray(renditions));
                assert.equal(renditions.length, 1);
                assert.equal(typeof outdir, "string");
                assert.ok(fs.existsSync(outdir));
                assert.ok(fs.statSync(outdir).isDirectory());

                const rendition = renditions[0];
                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                fs.writeFileSync(`${outdir}/${rendition.name}`, testUtil.RENDITION_CONTENT);
            }

            await process(testUtil.simpleParams(), workerFn);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            assert(nock.isDone());
        });

        it('should support the disableSourceDownloadSource flag', async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            function workerFn(infile, renditions, outdir) {
                assert.equal(typeof infile, "string");
                // must not download
                assert.ok(!fs.existsSync(infile));

                assert.ok(Array.isArray(renditions));
                assert.equal(renditions.length, 1);
                assert.equal(typeof outdir, "string");
                assert.ok(fs.existsSync(outdir));
                assert.ok(fs.statSync(outdir).isDirectory());

                const rendition = renditions[0];
                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                fs.writeFileSync(`${outdir}/${rendition.name}`, testUtil.RENDITION_CONTENT);
            }

            await process(testUtil.simpleParams({noSourceDownload: true}), { disableSourceDownloadSource: true }, workerFn);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            assert(nock.isDone());
        });
    });

});