/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
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
                    target: "https://example.com/target.jpg"
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
