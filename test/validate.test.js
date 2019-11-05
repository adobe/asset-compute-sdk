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

const assert = require('assert');

const {validateParameters, validateRendition} = require('../lib/validate');

describe('validation tests', () => {
    beforeEach(() => {
        process.env.__OW_ACTION_NAME = 'test_action_validation';
    });

    it('validates a rendition', () => {
        assert.fail();
    });

    it('sets renditions target properly when a url is entered', () => {
        assert.fail();
    });

    it('sets renditions target properly when a target and a url is entered (target takes precedence)', () => {
        assert.fail();
    });

    it('throws if a rendition has no target and no url', () => {
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

    it('throws if rendition array is empty', () => {
        assert.fail();
    });

    it('verifies rendition target is a string or an object', () => {
        assert.fail();
    });
});