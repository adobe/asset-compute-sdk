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

const assert = require('assert');
const FileTypeChecker = require('../lib/utils/file-type.js');

describe("file-type.js", function (){
    // for local use, to verify file types 
    /*
    it.only("returns file type information", async function(){
        const localPath = << your file path here >> ;
        const result = await FileTypeChecker.extractTypeFormat(localPath);
        console.log(result);
        assert.ok(true);
    });
    //*/

    it("returns file type information", async function(){
        const filePath = "test/files/file.png";
        const result = await FileTypeChecker.extractTypeFormat(filePath);
        assert.equal(result.ext, "png");
        assert.equal(result.mime, "image/png");
    });

    it("returns null if file is too small for the guess", async function(){
        const filePath = "test/files/funky/1pixel.png";
        const result = await FileTypeChecker.extractTypeFormat(filePath);
        assert.equal(result, null);
    });

    it("verifies extension", async function(){
        let filePath = "test/files/file.png";
        let result = await FileTypeChecker.verifyTypeFormat(filePath, "png");
        assert.equal(result, true);

        filePath  = "test/files/funky/png-masquerading-as-jpg.jpg";
        result = await FileTypeChecker.verifyTypeFormat(filePath, "jpg");
        assert.equal(result, false);
    });

    it("verifies mime type", async function(){
        let filePath = "test/files/file.png";
        let result = await FileTypeChecker.verifyMimeType(filePath, "image/png");
        assert.equal(result, true);

        filePath  = "test/files/funky/png-masquerading-as-jpg.jpg";
        result = await FileTypeChecker.verifyTypeFormat(filePath, "image/jpg");
        assert.equal(result, false);
    });

    it("returns file type information for png when extension is wrong", async function(){
        const filePath = "test/files/funky/png-masquerading-as-jpg.jpg";
        const result = await FileTypeChecker.extractTypeFormat(filePath);
        assert.equal(result.ext, "png");
        assert.equal(result.mime, "image/png");
    });

    it("returns file type information when extension is wrong and file seems corrupt", async function(){
        // that file cannot be opened by preview, but browsers and VS Code will be able to open it
        // it may seem corrupt but it isn't. It's the wrong format <-> extension association
        const filePath = "test/files/funky/file-webp-masquerading-as-png.png";
        const result = await FileTypeChecker.extractTypeFormat(filePath);
        console.log(result);
        assert.equal(result.ext, "webp");
        assert.equal(result.mime, "image/webp");
    });
});