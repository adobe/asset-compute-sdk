/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2018 Adobe Systems Incorporated
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

'use strict'

const assert = require('assert');

const fileUtils = require('../../lib/utils/file-utils');

describe('Source filename tests', function() {
    it('gives a filename when source as string tests', function() {
        let source = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.jpg`);
        source = '';
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
    });
    it('handles source.name for name generation tests', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890.jpg';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.jpg`);
        source.name =  `  %789.PSD`;
        assert.strictEqual(fileUtils.sourceFilename(source), `source.PSD`);
        source.name =  `!@#$%^&*().png`;
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
        source.name = '';
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
    });
    it('handles mime-type for source.name tests', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.jpeg`);
        source.name =  '';
        source.mimeType = 'unknown mimeType'
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
        source.name = 'foo.png';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
    });
    it('handles source.url tests', function() {
        const source = { url: ''};
        source.url = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.jpg`);
        source.url = 'http://server.name/directory/file%20.png?query';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
        source.url = 'http://server.name/directory/file%20.png?';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
        source.url = 'xxx://server.name/directory/file.png?query';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
        source.url = 'NotAUrl';
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
        source.url='';
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
        source.mimeType ='image/png';
        assert.strictEqual(fileUtils.sourceFilename(source), `source.png`);
    });
    it('handles empty source object', function() {
        const source = { };
        assert.strictEqual(fileUtils.sourceFilename(source), 'source');
    });
});

describe('library rendition filename tests', function() {
    it('generates a filename when rendition.fmt undefined', function() {
        const rendition = { };
        assert.strictEqual(fileUtils.renditionFilename(rendition, 1), `rendition1`);
    });
    it('generates a filename when rendition.fmt set strangely', function() {
        const rendition = { fmt: '  '};
        assert.strictEqual(fileUtils.renditionFilename(rendition, 1), `rendition1.  `);
    });
    it('generates a filename when rendition.fmt defined', function() {
        const rendition = { fmt: 'gif' };
        assert.strictEqual(fileUtils.renditionFilename(rendition, 1), `rendition1.gif`);
    });
});