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
const assert = require('assert');
const fs = require('fs-extra');
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");

const REDDOT = "iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
describe("api.js", () => {
    beforeEach(function() {
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        testUtil.beforeEach();
    });

    afterEach(() => {
        testUtil.afterEach();
    });

    it('should download source, invoke worker callback and upload rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();

        async function workerFn(source, rendition) {
            await fs.writeFile(rendition.path, Buffer.from(REDDOT, "base64"));
            return Promise.resolve();
        }

        const main = worker(workerFn);
        // const params =  {
        //     source: SOURCE,
        //     renditions: [{
        //         ...options.rendition,
        //         fmt: "png",
        //         target: "https://example.com/MyRendition.png"
        //     }],
        //     requestId: "test-request-id",
        //     auth: PARAMS_AUTH,
        //     newRelicEventsURL: MetricsTestHelper.MOCK_URL,
        //     newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        // };
        const result = await main();

        // validate errors
        testUtil.nockPutFile('https://example.com/MyRendition.png', REDDOT);
        assert.ok(result.renditionErrors === undefined);

        testUtil.assertNockDone();
        await testUtil.assertSimpleParamsMetrics(receivedMetrics);

    });
});