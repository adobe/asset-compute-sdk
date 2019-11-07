/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 *  NOTICE:  All information contained herein is, and remains
 *  the property of Adobe Systems Incorporated and its suppliers,
 *  if any.  The intellectual and technical concepts contained
 *  herein are proprietary to Adobe Systems Incorporated and its
 *  suppliers and are protected by trade secret or copyright law.
 *  Dissemination of this information or reproduction of this material
 *  is strictly forbidden unless prior written permission is obtained
 *  from Adobe Systems Incorporated.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { forEachRendition, process, shellScriptWorker } = require('../lib/compat');

const testUtil = require('./testutil');
const fs = require('fs-extra');
const nock = require('nock');
const assert = require('assert');

describe('compat.js', () => {

    beforeEach(() => {
        testUtil.beforeEach();
    });

    afterEach( () => {
        testUtil.afterEach();
    });

    describe('forEachRendition()', () => {

        it("should throw if worker callback is invalid", async () => {
            try {
                await forEachRendition({}, "string");
                assert.fail("no error thrown if callback is a string");
            } catch (e) {
            }
            try {
                await forEachRendition({});
                assert.fail("no error thrown if no callback given");
            } catch (e) {
            }
            try {
                await forEachRendition({}, {});
                assert.fail("no error thrown if argument is object");
            } catch (e) {
            }
        });

        it("should return a function that returns a promise", async () => {
            const result = forEachRendition(testUtil.simpleParams(), function() {});
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            try {
                await result;
            } catch(e) {}
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
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

            assert(nock.isDone());
        });

        it('should support the disableSourceDownloadSource flag', async () => {
            function workerFn(infile, rendition, outdir) {
                assert.equal(typeof infile, "string");
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

            assert(nock.isDone());
        });

    });

    describe('process()', () => {

        it("should throw if worker callback is invalid", async () => {
            try {
                await process({}, "string");
                assert.fail("no error thrown if callback is a string");
            } catch (e) {
            }
            try {
                await process({});
                assert.fail("no error thrown if no callback given");
            } catch (e) {
            }
            try {
                await process({}, {});
                assert.fail("no error thrown if argument is object");
            } catch (e) {
            }
        });

        it("should return a function that returns a promise", async () => {
            const result = process(testUtil.simpleParams(), function() {});
            // check if it's a Promise, from https://stackoverflow.com/a/38339199/2709
            assert.equal(Promise.resolve(result), result);

            await result;
        });

        it('should download source, invoke worker callback and upload rendition', async () => {
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

            assert(nock.isDone());
        });

        it('should support the disableSourceDownloadSource flag', async () => {
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

            assert(nock.isDone());
        });
    });

    describe("shellScriptWorker()", () => {

        it("should run a shell script", () => {
            const main = shellScriptWorker();
            main(testUtil.simpleParams());
        });
    });
});