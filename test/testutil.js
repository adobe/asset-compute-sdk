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
const jsonwebtoken = require('jsonwebtoken');

const SOURCE_CONTENT = "source content";
const RENDITION_CONTENT = "rendition content";

function beforeEach() {
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

function nockPutFile(httpUrl, content) {
    const uri = url.parse(httpUrl);
    nock(`${uri.protocol}//${uri.host}`)
        .put(uri.path, content)
        .reply(200);
}

function simpleParams(options) {
    if (options && options.failDownload) {
        nockGetFile('https://example.com/MySourceFile.jpg').reply(500);
    }
    if (!options || !options.noSourceDownload) {
        nockGetFile('https://example.com/MySourceFile.jpg').reply(200, SOURCE_CONTENT);
    }
    if (!options || !options.noPut) {
        nockPutFile('https://example.com/MyRendition.png', RENDITION_CONTENT);
    }

    return {
        source: 'https://example.com/MySourceFile.jpg',
        renditions: [{
            fmt: "png",
            target: "https://example.com/MyRendition.png"
        }],
        requestId: "test-request-id",
        auth: {
            orgId: "orgId",
            accessToken: jsonwebtoken.sign({ client_id: "clientId" }, "key")
        }
    }
}

function paramsWithMultipleRenditions(options) {
    if (!options || !options.noGet) {
        nockGetFile('https://example.com/MySourceFile.jpg').reply(200, SOURCE_CONTENT);
    }
    if (!options || !options.noPut1) {
        nockPutFile('https://example.com/MyRendition1.png', RENDITION_CONTENT);
    }
    if (!options || !options.noPut2) {
        nockPutFile('https://example.com/MyRendition2.txt', RENDITION_CONTENT);
    }
    if (!options || !options.noPut3) {
        nockPutFile('https://example.com/MyRendition3.xml', RENDITION_CONTENT);
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
        requestId: "test-request-id",
        auth: {
            orgId: "orgId",
            accessToken: jsonwebtoken.sign({ client_id: "clientId" }, "key")
        }
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


module.exports = {
    SOURCE_CONTENT,
    RENDITION_CONTENT,
    beforeEach,
    afterEach,
    simpleParams,
    paramsWithMultipleRenditions,
    paramsWithFailingSourceDownload
};
