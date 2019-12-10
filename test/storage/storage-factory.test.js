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
const storageFactory = require('../../lib/storage/storage-factory');
const assert = require('assert');

describe('storage-factory.js', () => {
    it("should retrieve data download function", () => {
        const download = storageFactory.getDownload({ url: 'data:HelloWorld' });
        assert.equal(typeof download, "function");
    });

    it("should retrieve http download function", () => {
        const download = storageFactory.getDownload({ url: 'http://unittestingthismethod.com' });
        assert.equal(typeof download, "function");
    });
});
