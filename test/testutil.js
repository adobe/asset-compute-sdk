/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
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

const nock = require('nock');
const url = require('url');
const mockFs = require('mock-fs');
const assert = require('assert');
const lodash = require("lodash");
const zlib = require("zlib");
const MetricsTestHelper = require("@nui/openwhisk-newrelic/lib/testhelper");

const SOURCE_CONTENT = "source content";
const RENDITION_CONTENT = "rendition content";

function beforeEach() {
    nock.disableNetConnect();

    // log custom body depending on io events or new relic for helping with match issues
    nock.emitter.on('no match', (req, options, body) => {
        const method = options ? options.method : req.method;
        const url = options ? (options.url || options.href) : req.href;
        if (url && body) {
            if (url.startsWith("https://eg-ingress.adobe.io/api/events")) {
                body = JSON.parse(body);
                body.event = parseIoEventPayload(body.event);
            } else if (url.startsWith(MetricsTestHelper.MOCK_URL)) {
                body = gunzip(body);
            }
        }
        console.error("[nock] Error, no nock match found for:", method, url || options.host, body);
    });

    process.env.__OW_ACTION_NAME = "/namespace/package/test_action";
    process.env.NUI_DISABLE_RETRIES = "disable";
    mockFs();

    MetricsTestHelper.beforeEachTest();
}

function afterEach() {
    MetricsTestHelper.afterEachTest();
    nock.cleanAll();
    mockFs.restore();
    delete process.env.NUI_DISABLE_RETRIES;
    delete process.env.__OW_ACTION_NAME;
    delete process.env.__OW_DEADLINE;
}

function nockGetFile(httpUrl) {
    const uri = url.parse(httpUrl);
    return nock(`${uri.protocol}//${uri.host}`).get(uri.path);
}

function nockPutFile(httpUrl, content, status=200) {
    const uri = url.parse(httpUrl);
    nock(`${uri.protocol}//${uri.host}`)
        .put(uri.path, content)
        .reply(status);
}

function gunzip(body) {
    body = Buffer.from(body, 'hex');
    body = zlib.gunzipSync(body).toString();
    return JSON.parse(body);
}

const expectedMetrics = [];
let metricsNock;

function nockNewRelicMetrics(eventType, metrics) {
    if (expectedMetrics.length === 0) {
        metricsNock = nock(MetricsTestHelper.MOCK_BASE_URL)
            .filteringRequestBody(gunzip)
            .matchHeader("x-insert-key", MetricsTestHelper.MOCK_API_KEY)
            .post(MetricsTestHelper.MOCK_URL_PATH, array => {
                if (array.length !== expectedMetrics.length) {
                    return false;
                }
                for (let i = 0; i < array.length; i++) {
                    const event = array[i];
                    const expected = expectedMetrics[i];
                    if (event.eventType !== expected.eventType
                        || typeof event.timestamp !== 'number'
                        || (event.eventType === "activation" && typeof event.duration !== 'number')
                        || (expected && !lodash.matches(expected)(event))) {
                            return false;
                        }
                }
                return true;
            })
            .reply(200, {});
    }
    expectedMetrics.push({
        eventType,
        ...metrics
    });
    return metricsNock;
}

function parseIoEventPayload(event) {
    return JSON.parse(Buffer.from(event, 'base64').toString());
}

function nockIOEvent(expectedPayload, status=200) {
    return nock("https://eg-ingress.adobe.io")
        .post("/api/events", body => {
            const payload = parseIoEventPayload(body.event);

            return (body.user_guid === "org"
                && body.provider_id === "asset_compute_org_client"
                && body.event_code === "asset_compute"
                // if no expected payload is set, match any payload
                // otherwise check for partial match of expected payload
                && (!expectedPayload || lodash.matches(expectedPayload)(payload)));
        })
        .reply(status);
}

const PARAMS_AUTH = {
    orgId: "org",
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
    clientId: "client"
};

function simpleParams(options={}) {
    let SOURCE = 'https://example.com/MySourceFile.jpg';
    if (options.sourceIsDataUri) {
        SOURCE = "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=";
    }

    if (options.failDownload) {
        nockGetFile(SOURCE).reply(500);

        if (!options.noMetricsNock) {
            nockNewRelicMetrics("error", {
                location: "test_action_download"
            });
            nockNewRelicMetrics("error", {
                location: "test_action_download"
            });
        }
    }
    if (!options.noSourceDownload) {
        nockGetFile(SOURCE).reply(200, SOURCE_CONTENT);
    }
    if (options.failUpload) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT, 500);

        if (!options.noMetricsNock) {
            nockNewRelicMetrics("error", {
                location: "test_action_upload"
            });
        }
    } else if (!options.noPut) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT);
    }

    if (!options.noEventsNock) {
        nockIOEvent();
    }

    if (!options.noMetricsNock) {
        nockNewRelicMetrics("rendition", {
            fmt: "png",
            renditionFormat: "png",
            size: RENDITION_CONTENT.length,
            requestId: "test-request-id"
        });
        nockNewRelicMetrics("activation");
    }

    return {
        source: SOURCE,
        renditions: [Object.assign({
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }, options.rendition)],
        requestId: "test-request-id",
        auth: PARAMS_AUTH,
        newRelicEventsURL: MetricsTestHelper.MOCK_URL,
        newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
    }
}

function paramsWithMultipleRenditions(options={}) {
    if (!options.noGet) {
        const status = (options && options.getStatus) || 200;
        nockGetFile('https://example.com/MySourceFile.jpg').reply(status, SOURCE_CONTENT);
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

    if (!options.noMetricsNock) {
        nockNewRelicMetrics("rendition", {
            name: "MyRendition1.png",
            fmt: "png",
            renditionName: "MyRendition1.png",
            renditionFormat: "png",
            size: RENDITION_CONTENT.length,
            sourceName: "MySourceFile.jpg",
            sourceMimetype: "image/jpeg",
            sourceSize: 200,
            requestId: "test-request-id"
        });
        nockNewRelicMetrics("rendition", {
            name: "MyRendition2.txt",
            fmt: "txt",
            renditionName: "MyRendition2.txt",
            renditionFormat: "txt",
            size: RENDITION_CONTENT.length,
            sourceName: "MySourceFile.jpg",
            sourceMimetype: "image/jpeg",
            sourceSize: 200,
            requestId: "test-request-id"
        });
        nockNewRelicMetrics("rendition", {
            name: "MyRendition3.xml",
            fmt: "xml",
            renditionName: "MyRendition3.xml",
            renditionFormat: "xml",
            size: RENDITION_CONTENT.length,
            sourceName: "MySourceFile.jpg",
            sourceMimetype: "image/jpeg",
            sourceSize: 200,
            requestId: "test-request-id"
        });
        nockNewRelicMetrics("activation");
    }

    return {
        source: {
            url: 'https://example.com/MySourceFile.jpg',
            name: "MySourceFile.jpg",
            mimetype: "image/jpeg",
            size: 200
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
    } catch (e) {
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
    assertNockDone,
    assertThrowsAndAwait,
    nockNewRelicMetrics,
    PARAMS_AUTH
};
