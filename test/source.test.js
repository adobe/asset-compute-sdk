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
const Source = require('../lib/source');

describe("source.js", () => {
    it('verifies path with no name and no directory', function() {
        const source = new Source({});
        assert.strictEqual(source.name, "");
        assert.strictEqual(source.path, ".");
    });

    it('verifies path with no name and a directory', function() {
        const source = new Source({}, "/tmp");
        assert.strictEqual(source.name, "");
        assert.strictEqual(source.path, "/tmp");
    });
    it('verifies path with name and no directory and empty source object', function() {
        const sourceName = 'test-source.png';
        const source = new Source({}, undefined, sourceName);
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, 'test-source.png');
        assert.strictEqual(source.url, undefined);
        assert.strictEqual(source.type, undefined);
    });

    it('verifies path with name and source object but no directory', function() {
        const sourceName = 'test-source.png';
        const sourceObj = {
            url: 'https://example.com',
            type: 'type'
        };
        const source = new Source(sourceObj, undefined, sourceName);
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, 'test-source.png');
        assert.strictEqual(source.url, 'https://example.com');
        assert.strictEqual(source.type, 'type');
    });


    it('verifies path with name and with a directory with trailing slash', function() {
        const sourceName = 'test-source.png';
        const sourceObj = {
            url: 'https://example.com',
            type: 'type'
        };
        const source = new Source(sourceObj, '/', sourceName);
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, '/test-source.png');
        assert.strictEqual(source.url, 'https://example.com');
        assert.strictEqual(source.type, 'type');
    });

    it('verifies path with name and with a directory with no trailing slash', function() {
        const sourceName = 'test-source.png';
        const sourceObj = {
            url: 'https://example.com',
            type: 'type'
        };
        const source = new Source(sourceObj, '/tmp', sourceName);
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, '/tmp/test-source.png');
        assert.strictEqual(source.url, 'https://example.com');
        assert.strictEqual(source.type, 'type');
    });
    it.skip('verifies name with source as an object', function() {
        const source = {};
        assert.strictEqual(new Source(source, undefined, 'source').name, 'source');
        source.name = 'abcdz-AZ1234567890.jpg';
        assert.strictEqual(new Source(source, undefined, 'source').name, `source.jpg`);
        source.url =  `  %789.PSD`;
        assert.strictEqual(new Source(source, undefined, 'source').name, `source.PSD`);
        source.name =  `!@#$%^&*().png`;
        assert.strictEqual(new Source(source).name, `source.png`);
        source.name = '';
        assert.strictEqual(new Source(source).name, 'source');
    });

    // TODO: this logic moved to storage.js so we will move these tests there
    it.skip('verifies name using mimeType', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(new Source(source).name, `source.jpeg`);
        source.name =  '';
        source.mimeType = 'unknown mimeType';
        assert.strictEqual(new Source(source).name, 'source');
        source.name = 'foo.png';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(new Source(source).name, `source.png`);
    });
    it.skip('verifies name with source a url', function() {
        const source = { url: ''};
        source.url = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(new Source(source).name, `source.jpg`);
        source.url = 'http://server.name/directory/file%20.png?query';
        assert.strictEqual(new Source(source).name, `source.png`);
        source.url = 'http://server.name/directory/file%20.png?';
        assert.strictEqual(new Source(source).name, `source.png`);
        source.url = 'xxx://server.name/directory/file.png?query';
        assert.strictEqual(new Source(source).name, `source.png`);
        source.url = 'NotAUrl';
        assert.strictEqual(new Source(source).name, 'source');
        source.url='';
        assert.strictEqual(new Source(source).name, 'source');
        source.mimeType ='image/png';
        assert.strictEqual(new Source(source).name, `source.png`);
    });
});
