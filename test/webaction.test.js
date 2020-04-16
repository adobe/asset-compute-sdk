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
/* eslint mocha/no-mocha-arrows: "error" */

'use strict';

const { worker } = require('../lib/api');

const testUtil = require('./testutil');
const assert = require('assert');
const fs = require('fs-extra');
const mockFs = require('mock-fs');
const MetricsTestHelper = require("@nui/openwhisk-newrelic/lib/testhelper");
const mockRequire = require("mock-require");

describe("web action for custom workers", function() {
    beforeEach(function() {
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        testUtil.beforeEach();
    });

    afterEach(function() {
        testUtil.afterEach();
    });

    function workerWithMockedOpenWhiskInvoke(invokeFn) {
        mockRequire("openwhisk", () => ({
            actions: {
                invoke: invokeFn
            }
        }));

        mockFs.restore();
        mockRequire.reRequire('../lib/webaction');
        const { worker } = mockRequire.reRequire('../lib/api');
        return worker;
    }

    it('should invoke itself asynchronously if invoked as web action', async function() {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();

        const ACTIVATION_ID = "1234567890";

        // mock openwhisk
        const invokedActions = [];

        const worker = workerWithMockedOpenWhiskInvoke((args) => {
            args.activationId = ACTIVATION_ID;
            invokedActions.push(args);
            return {
                activationId: ACTIVATION_ID
            };
        });

        // invoke worker with web action
        const REQUEST_ID = "test-request-id";
        const params = {
            source: {
                url: "https://example.com/MySourceFile.jpg",
                name: "MySourceFile.jpg",
                mimetype: "image/jpeg",
                size: 200
            },
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition.png"
            }],
            userData: {
                key: "value"
            },
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY,
            times: {
                gatewayToProcessDuration: 1.2
            }
        };
        // https://github.com/apache/openwhisk/blob/master/docs/webactions.md
        params.__ow_method = "post";
        params.__ow_headers = {
            // must be parsed in the worker
            "authorization": `Bearer ${testUtil.PARAMS_AUTH.accessToken}`,
            "x-gw-ims-org-id": testUtil.PARAMS_AUTH.orgId,
            "x-gw-ims-org-name": testUtil.PARAMS_AUTH.orgName,
            "x-app-name": testUtil.PARAMS_AUTH.appName,
            "x-request-id": REQUEST_ID,
            "Content-Type": "application/json"
        };

        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });
        const result = await main(params);

        // check correct async action invocation was done
        assert.strictEqual(invokedActions.length, 1);
        const invocation = invokedActions[0];
        assert.strictEqual(invocation.name, "/namespace/package/test_action");
        assert(!invocation.blocking); // must be async
        assert(!invocation.result);
        assert.strictEqual(invocation.activationId, ACTIVATION_ID);
        assert.strictEqual(typeof invocation.params, "object");
        assert.strictEqual(invocation.params.requestId, REQUEST_ID);
        assert.strictEqual(typeof invocation.params.auth, "object");
        assert.strictEqual(invocation.params.auth.accessToken, testUtil.PARAMS_AUTH.accessToken);
        assert.strictEqual(invocation.params.auth.orgId, testUtil.PARAMS_AUTH.orgId);
        assert.strictEqual(invocation.params.auth.orgName, testUtil.PARAMS_AUTH.orgName);
        assert.strictEqual(invocation.params.auth.clientId, testUtil.PARAMS_AUTH.clientId);
        assert.strictEqual(invocation.params.auth.appName, testUtil.PARAMS_AUTH.appName);
        assert.strictEqual(invocation.params.source, params.source);
        assert.strictEqual(invocation.params.renditions, params.renditions);
        assert.strictEqual(invocation.params.userData, params.userData);
        assert.strictEqual(invocation.params.newRelicEventsURL, params.newRelicEventsURL);
        assert.strictEqual(invocation.params.newRelicApiKey, params.newRelicApiKey);
        assert.strictEqual(invocation.params.times, params.times);
        assert.strictEqual(invocation.params.customWorker, true);

        // check web action result is correct
        assert.strictEqual(result.statusCode, 200);
        assert.strictEqual(typeof result.body, "object");
        assert.strictEqual(result.body.activationId, ACTIVATION_ID);

        // check metrics
        await MetricsTestHelper.metricsDone();
        MetricsTestHelper.assertArrayContains(receivedMetrics, [{
            eventType: "activation",
            sourceName: "MySourceFile.jpg",
            sourceMimetype: "image/jpeg",
            sourceSize: 200,
            orgId: testUtil.PARAMS_AUTH.orgId,
            orgName: testUtil.PARAMS_AUTH.orgName,
            clientId: testUtil.PARAMS_AUTH.clientId,
            appName: testUtil.PARAMS_AUTH.appName,
            requestId: "test-request-id",
            actionName: "test_action",
            namespace: "namespace"
        }]);
    });

    async function assertHttpError(cb, statusCode) {
        await assert.rejects(cb, (err) => {
            assert.strictEqual(err.statusCode, statusCode);
            assert.strictEqual(typeof err.body, "object");
            // just ensure error message is present
            assert.strictEqual(typeof err.body.message, "string");
            return true;
        });
    }

    it('should return http 405 if invoked as web action using GET', async function() {
        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });

        // test a couple (we can't test all string combinations)
        const UNSUPPORTED_METHODS = ["GET", "HEAD", "DELETE", "PATCH"];

        for (const method of UNSUPPORTED_METHODS) {
            const params = {
                __ow_method: method.toLowerCase()
            };

            // check web action throws error with http error response
            await assertHttpError(main(params), 405);
        }
    });

    it('should return http 401 if access token is missing', async function() {
        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });

        const params = {
            __ow_method: "post",
            __ow_headers: {
            }
        };

        await assertHttpError(main(params), 401);
    });

    it('should return http 401 if access token is invalid', async function() {
        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });

        const params = {
            __ow_method: "post",
            __ow_headers: {
                "authorization": `Bearer INVALID_TOKEN`,
            }
        };

        await assertHttpError(main(params), 401);
    });

    it('should return http 429 if async invocation fails with 429', async function() {
        const worker = workerWithMockedOpenWhiskInvoke(() => {
            throw {
                statusCode: 429
            };
        });

        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });

        const params = {
            __ow_method: "post",
            __ow_headers: {
                "authorization": `Bearer ${testUtil.PARAMS_AUTH.accessToken}`,
            }
        };

        await assertHttpError(main(params), 429);
    });

    it('should return http 500 if async invocation fails with 500', async function() {
        const worker = workerWithMockedOpenWhiskInvoke(() => {
            throw {
                statusCode: 500
            };
        });

        const main = worker(() => {
            assert.fail("worker function should not be invoked");
        });

        const params = {
            __ow_method: "post",
            __ow_headers: {
                "authorization": `Bearer ${testUtil.PARAMS_AUTH.accessToken}`,
            }
        };

        await assertHttpError(main(params), 500);
    });

    it('should include activation id in io events in case of custom worker', async function() {
        MetricsTestHelper.mockNewRelic();

        const ACTIVATION_ID = "1234567890";

        process.env.__OW_ACTIVATION_ID = ACTIVATION_ID;

        function workerFn(source, rendition) {
            if (rendition.target === "https://example.com/MyRendition.png") {
                fs.writeFileSync(rendition.path, testUtil.RENDITION_CONTENT);
            } // else fail second rendition
            return Promise.resolve();
        }

        const main = worker(workerFn);
        const params = testUtil.simpleParams({ noEventsNock: true });
        params.renditions.push({
            target: "https://example.com/rendition-failing.png"
        });

        // set custom worker flag
        params.customWorker = true;

        testUtil.nockIOEvent({
            type: "rendition_created",
            rendition: {
                fmt: "png"
            },
            source: "https://example.com/MySourceFile.jpg",
            metadata: {
                "repo:size": testUtil.RENDITION_CONTENT.length
            },
            // must include the activation id
            activationIds: [
                ACTIVATION_ID
            ]
        });
        testUtil.nockIOEvent({
            type: "rendition_failed",
            errorReason: 'GenericError',
            errorMessage: 'No rendition generated for 1',
            rendition: {},
            source: "https://example.com/MySourceFile.jpg",
            // must include the activation id
            activationIds: [
                ACTIVATION_ID
            ]
        });

        await main(params);

        testUtil.assertNockDone();
    });
});
