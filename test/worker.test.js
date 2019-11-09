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

const AssetComputeWorker = require('../lib/worker');

const fse = require('fs-extra');
const process = require('process');
const assert = require('assert');
//const {cleanupDirectories} = require('./prepare');

describe("it tries something", () => {
    it("just fails", async () => {
        const sinon = require('sinon');
    
        const stub =sinon.stub(fse, 'remove').rejects("reject cleanup");
        const processSpy =  sinon.stub(process, 'exit').returns(1);

        const params = {
            source: "https://adobe.com",
            renditions: [
                {
                    url: "one-url",
                    target: "one-target"
                }
            ]
        }

        const testWorker = new AssetComputeWorker(params);
        testWorker.directories = {
            base: '/dev/null'
        };
        await testWorker.cleanup();

        assert.equal(processSpy.calledOnce, true);

        stub.restore();
    });
});
