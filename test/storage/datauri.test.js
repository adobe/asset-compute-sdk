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
const mockFs = require("mock-fs");
const fs = require('fs-extra');
const { download } = require('../../lib/storage/datauri');
const nock = require('nock');
const assert = require('assert');

describe('datauri.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    })
    afterEach( () => {
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
    })

    it("should download data uri", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt"
        };

        mockFs({ './storeFiles/txt': {} });

        const file = "./storeFiles/txt/inlineData.txt";

        await download(source, file);
        assert.ok(fs.existsSync(file));
        assert.equal(fs.readFileSync(file).toString(), 'Hello, World!');
        assert.ok(nock.isDone());
    });

    it("should fail download data uri on fs error", async() => {
        const source = {
            url: "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D",
            name: "inlineData.txt"
        };

        const file = "./storeFiles/txt/inlineData.txt";

        try {
            await download(source, file);
        } catch (e) {
            assert.equal(e.name, 'GenericError');
            assert.equal(e.location, 'test_action_download');
        }
        assert.ok(!fs.existsSync(file));
        assert.ok(nock.isDone());
    });
});