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

const assert = require('assert');
const Source = require('../lib/source');

describe("source.js", () => {
    it('verifies name and path with source as string and with no directory', function() {
        const sourceName = 'test-source.png';
        const source = new Source(sourceName);
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, 'test-source.png');
    });

    it('verifies name and path with source as string and with a directory with trailing slash', function () {
        const sourceName = 'test-source.png';
        const source = new Source(sourceName, "/");
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, '/test-source.png');
    });

    it('verifies name and path with source as string and with a directory with no trailing slash', function () {
        const sourceName = 'test-source.png';
        const source = new Source(sourceName, "/tmp");
        assert.strictEqual(source.name, 'test-source.png');
        assert.strictEqual(source.path, '/tmp/test-source.png');
    });

    it('verifies name and path with source as empty string', function () {
        const sourceName = '';
        const source = new Source(sourceName);
        assert.strictEqual(source.name, '');
    });
    it('verifies name with source as an object', function() {
        const source = {};
        assert.strictEqual(new Source(source).name, 'source');
        source.name = 'abcdz-AZ1234567890.jpg';
        assert.strictEqual(new Source(source).name, `source.jpg`);
        source.name =  `  %789.PSD`;
        assert.strictEqual(new Source(source).name, `source.PSD`);
        source.name =  `!@#$%^&*().png`;
        assert.strictEqual(new Source(source).name, `source.png`);
        source.name = '';
        assert.strictEqual(new Source(source).name, 'source');
    });
    it('verifies name using mimeType', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(new Source(source).name, `source.jpeg`);
        source.name =  '';
        source.mimeType = 'unknown mimeType'
        assert.strictEqual(new Source(source).name, 'source');
        source.name = 'foo.png';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(new Source(source).name, `source.png`);
    });
    it('verifies name with source a url', function() {
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
    it('verifies name with empty source object', function() {
        const source = { };
        assert.strictEqual(new Source(source).name, 'source');
    });
});