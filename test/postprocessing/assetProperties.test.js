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
const fs = require("fs-extra");
const path = require("path");

const { getDimensions } = require('../../lib/postprocessing/assetProperties');

describe("assetProperties.js", () => {
    beforeEach(async function () {
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
        await fs.mkdirs('build');
        await fs.mkdirs('build/work');
    });

    afterEach(() => {
        delete process.env.WORKER_BASE_DIRECTORY;
        delete process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG;
    });

    it('dimensions', () => {

        const asset = "./test/files/file.png";
        const results = getDimensions(asset);

        assert.strictEqual(results.height, 288);
        assert.strictEqual(results.width, 512);
        assert.strictEqual(Object.keys(results).length, 2);
    });

});
