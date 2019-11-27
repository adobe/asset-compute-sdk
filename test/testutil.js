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

const SOURCE_CONTENT = "source content";
const RENDITION_CONTENT = "rendition content";

function beforeEach() {
    nock.disableNetConnect();
    process.env.__OW_ACTION_NAME = "/namespace/package/test_action";
    process.env.NUI_DISABLE_RETRIES = "disable";
    mockFs();
}

function afterEach() {
    nock.cleanAll();
    mockFs.restore();
    delete process.env.NUI_DISABLE_RETRIES;
    delete process.env.__OW_ACTION_NAME;
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
    console.log("New Relic received:", JSON.stringify(JSON.parse(body), null, 1));
    return JSON.parse(body);
}

function nockNewRelicMetrics(expectedEventType, expectedMetrics) {
    return nock("http://newrelic.com")
        .matchHeader("x-insert-key", "new-relic-api-key")
        .post("/events", body => {
            const metrics = gunzip(body);
            return metrics.eventType === expectedEventType
            && typeof metrics.timestamp === 'number'
            && (!expectedMetrics || lodash.matches(expectedMetrics)(metrics));
        })
        .reply(200, {});
}


function nockIOEvent(expectedPayload) {
    return nock("https://eg-ingress.adobe.io")
        // .log(console.log)
        .post("/api/events", body => {
            const payload = JSON.parse(Buffer.from(body.event, 'base64').toString());
            // console.log(body);
            // console.log(payload);

            return body.user_guid === "org"
                && body.provider_id === "asset_compute_org_test_client"
                && body.event_code === "asset_compute"
                // if no expected payload is set, match any payload
                // otherwise check for partial match of expected payload
                && (!expectedPayload || lodash.matches(expectedPayload)(payload));
        })
        .reply(200);
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
    if (options.failDownload) {
        nockGetFile('https://example.com/MySourceFile.jpg').reply(500);
    }
    if (!options.noSourceDownload) {
        nockGetFile('https://example.com/MySourceFile.jpg').reply(200, SOURCE_CONTENT);
    }
    if (!options.noPut) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT);
    }
    if (!options.noEventsNock) {
        nockIOEvent();
    }
    if (!options.noMetricsNock) {
        nockNewRelicMetrics("rendition");
        nockNewRelicMetrics("activation");
    }

    return {
        source: 'https://example.com/MySourceFile.jpg',
        renditions: [Object.assign({
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }, options.rendition)],
        requestId: "test-request-id",
        auth: PARAMS_AUTH,
        newRelicEventsURL: "http://newrelic.com/events",
        newRelicApiKey: "new-relic-api-key"
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

    return {
        source: 'https://example.com/MySourceFile.jpg',
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
        auth: PARAMS_AUTH
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
    nockNewRelicMetrics
};
