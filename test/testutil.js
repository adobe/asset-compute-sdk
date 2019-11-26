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

const SOURCE_CONTENT = "source content";
const RENDITION_CONTENT = "rendition content";

function beforeEach() {
    process.env.__OW_ACTION_NAME = "/namespace/package/test_action";
    process.env.NUI_DISABLE_RETRIES = "disable";
    process.env.NUI_UNIT_TEST_OUT = '/out';
    mockFs();
}

function afterEach() {
    nock.cleanAll();
    mockFs.restore();
    delete process.env.NUI_DISABLE_RETRIES;
    delete process.env.__OW_ACTION_NAME;
    delete process.env.NUI_UNIT_TEST_OUT;
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

    return {
        source: 'https://example.com/MySourceFile.jpg',
        renditions: [Object.assign({
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }, options.rendition)],
        requestId: "test-request-id"
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
    }
    if (!options.noPut2) {
        const status = (options && options.put2Status) || 200;
        nockPutFile('https://example.com/MyRendition2.txt',RENDITION_CONTENT, status);
    }
    if (!options.noPut3) {
        const status = (options && options.put3Status) || 200;
        nockPutFile('https://example.com/MyRendition3.xml',RENDITION_CONTENT, status);
    }

    return {
        source: 'https://example.com/MySourceFile.jpg',
        renditions: [{
            fmt: "png",
            target: "https://example.com/MyRendition1.png"
        },{
            fmt: "txt",
            target: "https://example.com/MyRendition2.txt"
        },{
            fmt: "xml",
            target: "https://example.com/MyRendition3.xml"
            }],
        requestId: "test-request-id"
    };
}

function paramsWithFailingSourceDownload() {
    nockGetFile('https://example.com/MissingSourceFile.jpg').reply(404);

    return {
        source: 'https://example.com/MissingSourceFile.jpg',
        renditions: [{
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }]
    };
}

function assertNockDone(nockScope) {
    nockScope = nockScope || nock;
    assert(nockScope.isDone(), "did not make these requests: " + nockScope.pendingMocks());
}


module.exports = {
    SOURCE_CONTENT,
    RENDITION_CONTENT,
    beforeEach,
    afterEach,
    simpleParams,
    paramsWithMultipleRenditions,
    paramsWithFailingSourceDownload,
    assertNockDone
};
