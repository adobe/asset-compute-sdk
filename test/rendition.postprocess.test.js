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
const REDDOT_JPEG = "ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMTAwNDgwMDQ4MDAwMGZmZGIwMDQzMDAwODA2MDYwNzA2MDUwODA3MDcwNzA5MDkwODBhMGMxNDBkMGMwYjBiMGMxOTEyMTMwZjE0MWQxYTFmMWUxZDFhMWMxYzIwMjQyZTI3MjAyMjJjMjMxYzFjMjgzNzI5MmMzMDMxMzQzNDM0MWYyNzM5M2QzODMyM2MyZTMzMzQzMmZmZGIwMDQzMDEwOTA5MDkwYzBiMGMxODBkMGQxODMyMjExYzIxMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMjMyMzIzMmZmYzAwMDExMDgwMDA1MDAwNTAzMDEyMjAwMDIxMTAxMDMxMTAxZmZjNDAwMTUwMDAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNWZmYzQwMDIwMTAwMDAxMDMwNDAyMDMwMDAwMDAwMDAwMDAwMDAwMDAwMDAxMDQwMzAwMDYwMjA1MTIyMTExMTMyMjMyZmZjNDAwMTUwMTAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDQwNmZmYzQwMDFmMTEwMDAyMDAwNjAzMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDEwMzExMDAwNDA1NDE1MTYxMzE0MmZmZGEwMDBjMDMwMTAwMDIxMTAzMTEwMDNmMDBhNTRhZDJiOTVjOWU3NmEyNGM5YWE3NTg4NWQ0NmE3YzZmM2VkMGJiNjUyNzY3MDZkNzc1NzhlN2Q0OWU0OWZhMzExMTA1MDIwMDEwNGRmN2I3Y2JlZWE5YjJiOTViYTg1NzRjMDFhOTQ4N2U0MWZhMDJmNjJmOWFmZmQ5";

describe("imagePostProcess", () => {
    beforeEach(function () {
        process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;
        process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;
        process.env.DISABLE_IO_EVENTS_ON_TIMEOUT = true;
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

    it.only('should convert PNG to JPG - end to end test', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const main = worker(workerFn);
        const params = {
            source: `data:image/png;base64,${REDDOT}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        // TODO: adjust values
        assert.equal(events[0].metadata["tiff:imageWidth"], 5);
        assert.equal(events[0].metadata["tiff:imageHeight"], 5);
        assert.equal(events[0].metadata["dc:format"], "image/jpeg");
        assert.equal(uploadedRenditions["/MyRendition.jpg"], Buffer.from(REDDOT_JPEG, "base64"));
    });
});
