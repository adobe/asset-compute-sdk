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
const mockFs = require("mock-fs");
const fsPromises = require('fs').promises;
const nock = require('nock');
const { fileExistsAndIsNotEmpty } = require('../../lib/utils/fileutils');

describe('fileutils.js', () => {

    beforeEach( () => {
        mockFs();
        process.env.__OW_ACTION_NAME = 'test_action';
    });
    afterEach( () => {
        nock.cleanAll();
        mockFs.restore();
        delete process.env.__OW_ACTION_NAME;
    });

    it("fileExistsAndIsNotEmpty should return false for non existent file", async() => {
        const file = "./storeFiles/txt/inlineData.txt";
        assert.ok(!fileExistsAndIsNotEmpty(file));
        assert.ok(nock.isDone());
    });

    it("fileExistsAndIsNotEmpty should return false for empty file", async() => {
        const file = "./storeFiles/txt/inlineData.txt";
        mockFs({ './storeFiles/txt': {} });
        await fsPromises.writeFile(file, '');
        assert.ok(!fileExistsAndIsNotEmpty(file));
        assert.ok(nock.isDone());
    });

    it("fileExistsAndIsNotEmpty should return true for non-empty file", async() => {
        const file = "./storeFiles/txt/inlineData.txt";
        mockFs({ './storeFiles/txt': {} });
        await fsPromises.writeFile(file, 'Something');
        assert.ok(fileExistsAndIsNotEmpty(file));
        assert.ok(nock.isDone());
    });
});