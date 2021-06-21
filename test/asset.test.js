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
const Asset = require('../lib/asset');

describe("asset.js", () => {
    it('verifies there is no crash with undefined params', function() {
        let asset = new Asset(undefined);
        assert.strictEqual(asset.name, "");
        assert.strictEqual(asset.path, ".");
        assert.strictEqual(asset.headers, undefined);
        assert.strictEqual(asset.extension, "");

        asset = new Asset(undefined);
        assert.strictEqual(asset.name, "");
        assert.strictEqual(asset.path, ".");
        assert.strictEqual(asset.headers, undefined);
        assert.strictEqual(asset.extension, "");
    });

    it('verifies there is no crash with null params', function() {
        const asset = new Asset(null);
        assert.strictEqual(asset.name, "");
        assert.strictEqual(asset.path, ".");
        assert.strictEqual(asset.headers, undefined);
        assert.strictEqual(asset.extension, "");
    });

    it('verifies path with no name and no directory', function() {
        const asset = new Asset({});
        assert.strictEqual(asset.name, "");
        assert.strictEqual(asset.path, ".");
    });

    it('verifies path with no name and a directory', function() {
        const asset = new Asset({}, "/tmp");
        assert.strictEqual(asset.name, "");
        assert.strictEqual(asset.path, "/tmp");
    });

    it('verifies path with name and no directory and empty source object', function() {
        const assetName = 'test-asset.png';
        const asset = new Asset({}, undefined, assetName);
        assert.strictEqual(asset.name, 'test-asset.png');
        assert.strictEqual(asset.path, 'test-asset.png');
        assert.strictEqual(asset.url, undefined);
        assert.strictEqual(asset.type, undefined);
        assert.strictEqual(asset.extension, 'png');
    });

    it('verifies path with name and source object but no directory', function() {
        const assetName = 'test-asset.png';
        const sourceAsset = {
            url: 'https://example.com',
            type: 'type'
        };
        const asset = new Asset(sourceAsset, undefined, assetName);
        assert.strictEqual(asset.name, 'test-asset.png');
        assert.strictEqual(asset.path, 'test-asset.png');
        assert.strictEqual(asset.url, 'https://example.com');
        assert.strictEqual(asset.type, 'type');
        assert.strictEqual(asset.extension, 'png');
    });


    it('verifies path with name and with a directory with trailing slash', function() {
        const assetName = 'test-asset.png';
        const sourceAsset = {
            url: 'https://example.com',
            type: 'type'
        };
        const asset = new Asset(sourceAsset, '/', assetName);
        assert.strictEqual(asset.name, 'test-asset.png');
        assert.strictEqual(asset.path, '/test-asset.png');
        assert.strictEqual(asset.url, 'https://example.com');
        assert.strictEqual(asset.type, 'type');
        assert.strictEqual(asset.extension, 'png');
    });

    it('verifies path with name and with a directory with no trailing slash', function() {
        const assetName = 'test-asset.png';
        const sourceAsset = {
            url: 'https://example.com',
            type: 'type'
        };
        const asset = new Asset(sourceAsset, '/tmp', assetName);
        assert.strictEqual(asset.name, 'test-asset.png');
        assert.strictEqual(asset.path, '/tmp/test-asset.png');
        assert.strictEqual(asset.url, 'https://example.com');
        assert.strictEqual(asset.type, 'type');
        assert.strictEqual(asset.extension, 'png');
    });
});
