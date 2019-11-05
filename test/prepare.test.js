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

'use strict';

const fs = require('fs-extra');
const assert = require('assert');
const sinon = require('sinon');

const {actionName, validateParameters, createDirectories, cleanupDirectories} = require('../lib/prepare');

describe('prepare tests, filesystem related', () => {
    beforeEach(() => {
        // we actually want to test that fs behaves as expected
        process.env.NUI_UNIT_TEST_MODE = false;

        process.env.__OW_ACTION_NAME = 'test_action_fs';
    });

    it('just fails', () => {
        assert.fail();
    });

    it('creates needed directories', () => {
        assert.fail();
    });

    it('does not throw if directories to create already exist', () => {
        assert.fail();
    });

    it('cleans up folders on the filesystem', () => {
        assert.fail();
    });

    it('does not throw if directories to remove do not exist', () => {
        assert.fail();
    });
});

describe('validation tests', () => {
    beforeEach(() => {
        process.env.__OW_ACTION_NAME = 'test_action_validation';
    });
    it('just fails', () => {
        assert.fail();
    });

    it('throws when params.source is undefined or null', () => {
        assert.fail();
    });

    it('normalizes the url param', () => {
        assert.fail();
    });

    it('verifies renditions is an array (1 element)', () => {
        assert.fail();
    });

    it('verifies renditions is an array (many elements)', () => {
        assert.fail();
    });

    it('verifies rendition target is a string or an object', () => {
        assert.fail();
    });
});