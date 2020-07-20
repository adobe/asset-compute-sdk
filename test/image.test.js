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

const { worker } = require('../lib/api');

const testUtil = require('./testutil');
const mockFs = require('mock-fs');
const assert = require('assert');
const fs = require('fs-extra');
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");

const REDDOT = "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
describe("imagePostProcess", () => {
    beforeEach(function () {
        process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;
        process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;
        process.env.OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION = true;
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        testUtil.beforeEach();

        mockFs.restore();
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
    });

    afterEach(() => {
        testUtil.afterEach();
        delete process.env.WORKER_BASE_DIRECTORY;
    });

    it('should download source, invoke worker callback and upload rendition', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const putScope = testUtil.nockPutFile('https://example.com/MyRendition.png', Buffer.from(REDDOT, "base64"));

        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
        }

        const main = worker(workerFn);
        const params = {
            source: `data:image/png;base64,${REDDOT}`,
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition.png"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        const result = await main(params);

        // validate errors
        // console.log(result.renditionErrors);
        assert.ok(result.renditionErrors === undefined);

        // console.log("=======================================================");
        // console.log(events);
        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "png");
        // TODO: adjust values
        assert.equal(events[0].metadata["tiff:imageWidth"], 5);
        assert.equal(events[0].metadata["tiff:imageHeight"], 5);
        assert.equal(events[0].metadata["dc:format"], "image/png");

        putScope.done();
    });
});