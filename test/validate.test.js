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

const { validateParameters, validateRendition } = require('../lib/validate');
const { GenericError } = require('@nui/asset-compute-commons');

describe('validate.js', () => {
    beforeEach(() => {
        process.env.__OW_ACTION_NAME = 'test_action_validation';
    });

    it('validates a rendition', () => {
        const rendition = {
            target: "one-target"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "one-target");
    });

    it('sets renditions target properly when a url is entered', () => {
        const rendition = {
            url: "one-url"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "one-url");
    });

    it('sets renditions target properly when a target and a url is entered (target takes precedence)', () => {
        const rendition = {
            url: "one-url",
            target: "one-target"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "one-target");
    });

    it('throws if a rendition has no target and no url', () => {
        let rendition = {
            nothing: "nothing"
        };
        try {
            validateRendition(rendition);
        } catch(err){
            assert.ok(err instanceof GenericError);
        }
        
        rendition = {
            target: 42
        };
        try {
            validateRendition(rendition);
        } catch(err){
            assert.ok(err instanceof GenericError);
        }

        rendition = {
            url: 42
        };
        try {
            validateRendition(rendition);
        } catch(err){
            assert.ok(err instanceof GenericError);
        }

        rendition = {
            url: null
        };
        try {
            validateRendition(rendition);
        } catch(err){
            assert.ok(err instanceof GenericError);
        }
    });

    it('throws when params.source is undefined or null', () => {
        let paramsToValidate = {           
        };

        try {
            validateParameters(paramsToValidate);
        } catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "No 'source' in params. Required for asset workers.");
        }

        paramsToValidate = { 
            source: null          
        };

        try {
            validateParameters(paramsToValidate);
        } catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "No 'source' in params. Required for asset workers.");
        }
    });

    it('normalizes the url param', () => {
        const paramsToValidate = {    
            source: "string-source",
            renditions: [
                {
                    target: "one-target"
                },
                {
                    target: "two-targets"
                }
            ]       
        };

        validateParameters(paramsToValidate);
        assert.equal(typeof paramsToValidate.source, "object");
        assert.equal(paramsToValidate.source.url, "string-source");
    });

    it('verifies renditions is an array (1 element)', () => {
        const paramsToValidate = {    
            source: "string-source",
            renditions: [
                {
                    target: "one-target"
                }
            ]       
        };

        validateParameters(paramsToValidate);

        // verify array did not change size
        assert.equal(paramsToValidate.renditions.length, 1);
    });

    it('verifies renditions is an array (many elements)', () => {
        const paramsToValidate = {    
            source: "string-source",
            renditions: [
                {
                    target: "one-target"
                },
                {
                    target: "two-target"
                },
                {
                    target: "three-target"
                }
            ]       
        };

        validateParameters(paramsToValidate);

        // verify array did not change size
        assert.equal(paramsToValidate.renditions.length, 3);

        // verify order did not change
        assert.equal(paramsToValidate.renditions[0].target, "one-target");
        assert.equal(paramsToValidate.renditions[1].target, "two-target");
        assert.equal(paramsToValidate.renditions[2].target, "three-target");
    });

    it('throws if rendition array is empty', () => {
        let paramsToValidate = {    
            source: "string-source",
            renditions: []       
        };

        try{
            validateParameters(paramsToValidate);}
        catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "'renditions' array is empty.");
        }

        paramsToValidate = {    
            source: "string-source",
            renditions: [null, null]       
        };

        try{
            validateParameters(paramsToValidate);}
        catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "'renditions' array is empty.");
        }
    });

    it('throws if rendition is not an array', () => {
        let paramsToValidate = {    
            source: "string-source",
            renditions: "rendition-array"       
        };

        try{
            validateParameters(paramsToValidate);}
        catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "'renditions' is not an array.");
        }

        paramsToValidate = {    
            source: "string-source",
            renditions: {}      
        };

        try{
            validateParameters(paramsToValidate);}
        catch(err){
            assert.ok(err instanceof GenericError);
            assert.equal(err.message, "'renditions' is not an array.");
        }
    });
});