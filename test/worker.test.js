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

const process = require('process');
const assert = require('assert');
const sinon = require('sinon');

describe("worker.js", () => {
    it("should exit process on cleanup failure", async () => {

        const processSpy =  sinon.stub(process, 'exit').withArgs(231).returns(1);

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
            // this forces a cleanup failure as it cannot be deleted
            base: '/dev/null'
        };
        await testWorker.cleanup();

        assert.equal(processSpy.calledOnce, true, "did not call process.exit(231) on cleanup failure");
    });
});
