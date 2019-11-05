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

const mockFs = require('mock-fs');
const fs = require('fs-extra');
const nock = require('nock');
const { forEachRendition, process } = require('../index');
const proc = require('process');
const assert = require('assert');

describe('forEachRendition', () => {
    beforeEach(() => {
        proc.env.__OW_DEADLINE = Date.now() + 2000;
        proc.env.NUI_DISABLE_RETRIES = "disable";
        mockFs();
    });

    afterEach( () => {
        nock.cleanAll();
        mockFs.restore();
    });
    it('sourceUrl is passed through', () => {

    });
    it('should create correct directories for source aw url', async () => {

    });
    it('forEachRendition() invokes callback with correct parameters', async () => {
        function workerFn(infile, rendition, outdir) {
            assert.equal(typeof infile, "string");
            assert.equal(typeof rendition, "object");
            assert.equal(typeof rendition.name, "string");
            assert.ok(fs.existsSync(infile));
            assert.ok(!fs.existsSync(rendition.name));
            assert.equal(typeof outdir, "string");
            fs.writeFileSync(`${outdir}/${rendition.name}`, "hello world");
            return Promise.resolve();
        }
        nock('https://example.com')
            .get('/MySourceFile.jpg')
            .reply(200, "hello world");
        nock('https://example.com')
            .put('/MyRendition.png', 'hello world')
            .reply(200);

        const params = {
            source: 'https://example.com/MySourceFile.jpg',
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition.png"
            }]
        };
        await forEachRendition(params, workerFn);

        assert(nock.isDone());
    });

});

describe('process', () => {
    beforeEach(() => {
        proc.env.__OW_DEADLINE = Date.now() + 2000;
        proc.env.NUI_DISABLE_RETRIES = "disable";
        mockFs();
    });

    afterEach( () => {
        nock.cleanAll();
        mockFs.restore();
    });

    it('process() invokes callback with correct parameters', async () => {
        function workerFn(infile, renditions, outdir) {
            try{
                assert.equal(typeof infile, "string");
                assert.ok(fs.existsSync(infile));
                assert.ok(Array.isArray(renditions));
                assert.equal(renditions.length, 1);
                assert.equal(typeof outdir, "string");

                const rendition = renditions[0];
                assert.equal(typeof rendition, "object");
                assert.equal(typeof rendition.name, "string");
                fs.writeFileSync(`${outdir}/${rendition.name}`, "hello world");
                return Promise.resolve();
            } catch(e){
                console.log(e);
                return Promise.reject(e);
            }
        }

        nock('https://example.com')
            .get('/MySourceFile.jpg')
            .reply(200, "hello world");
        nock('https://example.com')
            .put('/MyRendition.png', 'hello world')
            .reply(200);

        const params = {
            source: 'https://example.com/MySourceFile.jpg',
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition.png"
            }]
        };
        await process(params, workerFn);

        assert(nock.isDone());
    });

});