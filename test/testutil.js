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

const assert = require('assert');
const mockFs = require('mock-fs');

const nock = require('nock');
const url = require('url');
const lodash = require("lodash");
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");

const SOURCE_CONTENT = "source content";
const RENDITION_CONTENT = "rendition content";

function beforeEach() {
    nock.cleanAll();

    // log custom body depending on io events or new relic for helping with match issues
    nock.emitter.on('no match', (req, options, body) => {
        const method = options ? options.method : req.method;
        const url = options ? (options.url || options.href) : req.href;
        if (url && body) {
            if (url.startsWith("https://eg-ingress.adobe.io/api/events")) {
                body = JSON.parse(body);
                body.event = parseIoEventPayload(body.event);
                console.error("[nock] Error, no nock match found for:", method, url || options.host, body);
            }
        }
    });

    process.env.__OW_NAMESPACE = "namespace";
    process.env.__OW_ACTION_NAME = "/namespace/package/test_action";
    process.env.ASSET_COMPUTE_DISABLE_RETRIES = "disable";

    // http instrumentation has timeouts that can get in the way and we do not need it for any of the tests
    process.env.OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION = true;

    mockFs();

    MetricsTestHelper.beforeEachTest();
}

function afterEach() {
    MetricsTestHelper.afterEachTest();
    nock.cleanAll();
    mockFs.restore();
    delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
    delete process.env.__OW_ACTION_NAME;
    delete process.env.__OW_DEADLINE;
    delete process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS;
}

function nockGetFile(httpUrl) {
    const uri = url.parse(httpUrl);
    return nock(`${uri.protocol}//${uri.host}`).get(uri.path);
}
function nockHeadRequest(httpUrl) {
    const uri = url.parse(httpUrl);
    return nock(`${uri.protocol}//${uri.host}`).head(uri.path);
}

function nockPutFile(httpUrl, content, status=200) {
    const uri = url.parse(httpUrl);
    return nock(`${uri.protocol}//${uri.host}`)
        .put(uri.path, content)
        .reply(status);
}

function mockPutFiles(httpUrl) {
    const uri = url.parse(httpUrl);
    const files = {};
    nock(`${uri.protocol}//${uri.host}`)
        .put(/.*/)
        .optionally()
        .reply(200, (path, requestBody) => {
            files[path] = Buffer.from(requestBody, 'hex');
        })
        .persist();
    return files;
}

function parseIoEventPayload(event) {
    return JSON.parse(Buffer.from(event, 'base64').toString());
}

function nockIOEvent(expectedPayload, status=200) {
    return nock("https://eg-ingress.adobe.io")
        .post("/api/events", body => {
            const payload = parseIoEventPayload(body.event);

            return (body.user_guid === "org"
                && body.provider_id === "asset_compute_org_test_client"
                && body.event_code === "asset_compute"
                // if no expected payload is set, match any payload
                // otherwise check for partial match of expected payload
                && (!expectedPayload || lodash.matches(expectedPayload)(payload)));
        })
        .reply(status);
}

function mockIOEvents() {
    const ioEvents = [];
    nock("https://eg-ingress.adobe.io")
        .post("/api/events", body => {
            ioEvents.push(parseIoEventPayload(body.event));
            return true;
        })
        .optionally()
        .reply(200)
        .persist();

    return ioEvents;
}

const PARAMS_AUTH = {
    orgId: "org",
    orgName: "My Org",
    appName: "My integration",
    // simple custom dummy access token that can be parsed as jwt
    // header:
    // {
    //     "alg": "HS256",
    //     "x5u": "ims.cer"
    // }
    // payload:
    // {
    //   "id": "1384371060214-ed821b40-58b6-4d5b-9d00-1ab2b9ab5656",
    //   "scope": "AdobeID,openid",
    //   "c": "Me/bVHInILr3WfGS8atUAQ==",
    //   "as": "ims-na1",
    //   "created_at": "1384371060214",
    //   "expires_in": "86400000",
    //   "user_id": "7F8F5A114A01713D9920FAAE@AdobeID",
    //   "client_id": "test_client",
    //   "type": "access_token"
    // }
    accessToken: "eyJhbGciOiJIUzI1NiIsIng1dSI6Imltcy5jZXIifQ.eyJpZCI6IjEzODQzNzEwNjAyMTQtZWQ4MjFiNDAtNThiNi00ZDViLTlkMDAtMWFiMmI5YWI1NjU2Iiwic2NvcGUiOiJBZG9iZUlELG9wZW5pZCIsImMiOiJNZS9iVkhJbklMcjNXZkdTOGF0VUFRPT0iLCJhcyI6Imltcy1uYTEiLCJjcmVhdGVkX2F0IjoiMTM4NDM3MTA2MDIxNCIsImV4cGlyZXNfaW4iOiI4NjQwMDAwMCIsInVzZXJfaWQiOiI3RjhGNUExMTRBMDE3MTNEOTkyMEZBQUVAQWRvYmVJRCIsImNsaWVudF9pZCI6InRlc3RfY2xpZW50IiwidHlwZSI6ImFjY2Vzc190b2tlbiJ9.yrvQEvXacgbDsq5fkWyWqLf45F5NYLsUVGegFUbZChU",
    clientId: "test_client"
};

function simpleParams(options={}) {
    // TODO: refactor to mock `node-httptransfer` using proxyquire instead of mocking the http requests directly
    let SOURCE = 'https://example.com/MySourceFile.jpg';
    if (options.sourceIsDataUri) {
        const base64SourceContent = Buffer.from(SOURCE_CONTENT).toString('base64');
        // SOURCE = "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=";
        SOURCE = `data:text/html;base64,${base64SourceContent}`;
    }
    if (!options.noHeadRequest) {
        nockHeadRequest(SOURCE).reply(200, "OK", {
            'content-length': 14,
            'content-type': 'image/jpeg'
        });
    }

    if (options.failDownload) {
        nockGetFile(SOURCE).reply(500);
    }
    if (!options.noSourceDownload) {
        nockGetFile(SOURCE).reply(200, SOURCE_CONTENT, {
            'content-length': 14
        });
    }
    if (options.failUpload) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT, 500);
    } else if (!options.noPut) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT);
    }

    if (!options.noEventsNock) {
        nockIOEvent();
    }

    return {
        source: SOURCE,
        renditions: [{
            ...options.rendition,
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }],
        requestId: "test-request-id",
        auth: PARAMS_AUTH,
        newRelicEventsURL: MetricsTestHelper.MOCK_URL,
        newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
    };
}

async function assertSimpleParamsMetrics(receivedMetrics, options={}) {
    await MetricsTestHelper.metricsDone();

    if (options.failDownload) {
        MetricsTestHelper.assertArrayContains(receivedMetrics, [{
            eventType: "error",
            location: "test_action_download"
        }]);
    }
    if (options.failUpload) {
        MetricsTestHelper.assertArrayContains(receivedMetrics, [{
            eventType: "error",
            location: "test_action_upload"
        }]);
    }

    MetricsTestHelper.assertArrayContains(receivedMetrics, [{
        eventType: "rendition",
        fmt: "png",
        renditionFormat: "png",
        size: RENDITION_CONTENT.length,
        requestId: "test-request-id"
    }]);
    MetricsTestHelper.assertArrayContains(receivedMetrics, [{
        eventType: "activation",
    }]);

    assertDurationMetrics(receivedMetrics);
}

function paramsWithMultipleRenditions(options={}) {
    if (options.doHeadRequest) {
        nockHeadRequest('https://example.com/MySourceFile.jpg').reply(200, "OK", {
            'content-length': 14,
            'content-type': 'image/jpeg'
        });
    }
    if (!options.noGet) {
        const status = (options && options.getStatus) || 200;
        // TODO: refactor to mock `node-httptransfer` using proxyquire instead of mocking the http requests directly
        nockGetFile('https://example.com/MySourceFile.jpg').reply(status, SOURCE_CONTENT, {
            'content-length': 14,
            'content-type': 'image/jpeg'
        });
    }
    if (!options.noPut1) {
        const status = (options && options.put1Status) || 200;
        nockPutFile('https://example.com/MyRendition1.png',RENDITION_CONTENT, status);
        if (!options.noEventsNock) {
            nockIOEvent();
        }
    }

    if (!options.noPut2) {
        const status = (options && options.put2Status) || 200;
        nockPutFile('https://example.com/MyRendition2.txt',RENDITION_CONTENT, status);
        if (!options.noEventsNock) {
            nockIOEvent();
        }
    }

    if (!options.noPut3) {
        const status = (options && options.put3Status) || 200;
        nockPutFile('https://example.com/MyRendition3.xml',RENDITION_CONTENT, status);
        if (!options.noEventsNock) {
            nockIOEvent();
        }
    }

    return {
        source: {
            url: 'https://example.com/MySourceFile.jpg',
            name: "MySourceFile.jpg",
            mimetype: "image/jpeg",
            size: 14
        },
        renditions: [{
            fmt: "png",
            name: "MyRendition1.png",
            target: "https://example.com/MyRendition1.png"
        },{
            fmt: "txt",
            name: "MyRendition2.txt",
            target: "https://example.com/MyRendition2.txt"
        },{
            fmt: "xml",
            name: "MyRendition3.xml",
            target: "https://example.com/MyRendition3.xml"
        }],
        requestId: "test-request-id",
        auth: PARAMS_AUTH,
        newRelicEventsURL: MetricsTestHelper.MOCK_URL,
        newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
    };
}

async function assertParamsWithMultipleRenditions(receivedMetrics) {
    await MetricsTestHelper.metricsDone();

    MetricsTestHelper.assertArrayContains(receivedMetrics, [{
        eventType: "rendition",
        name: "MyRendition1.png",
        fmt: "png",
        renditionName: "MyRendition1.png",
        renditionFormat: "png",
        size: RENDITION_CONTENT.length,
        sourceName: "MySourceFile.jpg",
        sourceMimetype: "image/jpeg",
        sourceSize: 14,
        requestId: "test-request-id"
    },{
        eventType: "rendition",
        name: "MyRendition2.txt",
        fmt: "txt",
        renditionName: "MyRendition2.txt",
        renditionFormat: "txt",
        size: RENDITION_CONTENT.length,
        sourceName: "MySourceFile.jpg",
        sourceMimetype: "image/jpeg",
        sourceSize: 14,
        requestId: "test-request-id"
    },{
        eventType: "rendition",
        name: "MyRendition3.xml",
        fmt: "xml",
        renditionName: "MyRendition3.xml",
        renditionFormat: "xml",
        size: RENDITION_CONTENT.length,
        sourceName: "MySourceFile.jpg",
        sourceMimetype: "image/jpeg",
        sourceSize: 14,
        requestId: "test-request-id"
    },{
        eventType: "activation"
    }]);

    assertDurationMetrics(receivedMetrics);
}

function assertDurationMetrics(receivedMetrics) {
    receivedMetrics.filter(metric => metric.eventType === "rendition").forEach(metric => {
        // must be positive values
        assert.ok(metric.downloadDuration > 0.0);
        assert.ok(metric.callbackProcessingDuration > 0.0);
        assert.ok(metric.postProcessingDuration > 0.0);
        assert.ok(metric.processingDuration > 0.0);
        assert.ok(metric.uploadDuration > 0.0);

        // processing has two sub measurements
        assert.ok(metric.processingDuration >= metric.callbackProcessingDuration + metric.postProcessingDuration);
    });

    const metric = receivedMetrics.find(metric => metric.eventType === "activation");
    if (metric) {
        // must be positive values
        assert.ok(metric.duration > 0.0);
        assert.ok(metric.downloadDuration > 0.0);
        assert.ok(metric.callbackProcessingDuration > 0.0);
        assert.ok(metric.postProcessingDuration > 0.0);
        assert.ok(metric.processingDuration > 0.0);
        // assert.ok(metric.uploadDuration > 0.0); // if mocked, upload duration may be exactly 0 

        // processing has two sub measurements
        assert.ok(metric.processingDuration >= metric.callbackProcessingDuration + metric.postProcessingDuration);

        // duration is the entire activation duration - everything else must be shorter
        assert.ok(metric.downloadDuration < metric.duration);
        assert.ok(metric.callbackProcessingDuration < metric.duration);
        assert.ok(metric.postProcessingDuration < metric.duration);
        assert.ok(metric.processingDuration < metric.duration);
        assert.ok(metric.uploadDuration < metric.duration);

        // download + process + upload are the main parts that make up the total activation
        assert.ok(metric.downloadDuration +
                  metric.processingDuration +
                  metric.uploadDuration <= metric.duration);
    }
}

function assertNockDone(nockScope) {
    nockScope = nockScope || nock;
    assert(nockScope.isDone(), "did not make these requests: " + nockScope.pendingMocks());
}

async function assertThrowsAndAwait(cb, message) {
    let thrown = false;
    try {
        // eslint-disable-next-line callback-return
        const promise = cb();
        await promise;
    } catch (e) { /* eslint-disable-line no-unused-vars */
        thrown = true;
    }
    if (!thrown) {
        assert.fail(message);
    }
}

module.exports = {
    SOURCE_CONTENT,
    RENDITION_CONTENT,
    beforeEach,
    afterEach,
    simpleParams,
    paramsWithMultipleRenditions,
    nockIOEvent,
    mockIOEvents,
    assertNockDone,
    assertThrowsAndAwait,
    PARAMS_AUTH,
    assertSimpleParamsMetrics,
    assertParamsWithMultipleRenditions,
    nockPutFile,
    mockPutFiles
};
