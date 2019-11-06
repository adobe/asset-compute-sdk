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
const fs = require('fs-extra');
const mockFs = require('mock-fs');
const Rendition = require('../lib/rendition.js');

describe("rendition.js", () => {
    let PNG_CONTENTS;
    let PNG_SIZE;
    beforeEach(() => {
        const filePath = "test/files/file.png";
        PNG_CONTENTS = fs.readFileSync(filePath);
        PNG_SIZE = fs.statSync(filePath).size;
        mockFs();
    });
    afterEach(() => {
        mockFs.restore();
    });
    it('verifies constructor works properly for directory with and without trailing slash ', function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        let directory = "/"; 
        let rendition = new Rendition(instructions, directory, 11);
        assert.strictEqual(rendition.instructions.fmt, "png");
        assert.strictEqual(rendition.directory, "/");
        assert.strictEqual(rendition.name, "rendition11.png");
        assert.strictEqual(rendition.path, "/rendition11.png");
        assert.strictEqual(rendition.index, 11);
        assert.strictEqual(rendition.target, "TargetName");

        instructions.fmt = "JPEG";
        instructions.target = "file with blanks";
        instructions.name = "idName";
        directory = "/tmp";
        rendition = new Rendition(instructions, directory);
        assert.strictEqual(rendition.instructions.fmt, "JPEG");
        assert.strictEqual(rendition.directory, "/tmp");
        assert.strictEqual(rendition.name, "rendition0.JPEG");
        assert.strictEqual(rendition.path, "/tmp/rendition0.JPEG");
        assert.strictEqual(rendition.index, 0);
        assert.strictEqual(rendition.target, "file with blanks");
    });
    it('verifies method size works properly', async function () {
        // First use a real image in the rendition
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        const rendition = new Rendition(instructions, directory, 11);
        assert.strictEqual(rendition.size(), PNG_SIZE);
    });

    it('verifies method sha1 works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        const rendition = new Rendition(instructions, directory, 11);
        const sha1 = await rendition.sha1();
        assert.strictEqual(sha1, 'fe16bfbff4e31fcf726c18fe4051b71ee8c96150');
    });

    it('verifies method id works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        let rendition = new Rendition(instructions, directory, 11);
        assert.strictEqual(rendition.id(), 11);

        // rendition.id differs depending upon whether instructions.name is set or not
        instructions.name = "idName";
        rendition = new Rendition(instructions, directory);
        assert.strictEqual(rendition.id(), "idName");
    });

    it('verifies method instructionsForEvent works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        const rendition = new Rendition(instructions, directory, 11);
        const inst = rendition.instructionsForEvent();
        assert.ok(!inst.target);
        assert.strictEqual(inst.fmt, "png");
    });

    it('verifies method metadata works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        let rendition = new Rendition(instructions, directory, 11);
        let metadata = await rendition.metadata();
        assert.strictEqual(metadata['repo:size'], 193011);
        assert.strictEqual(metadata['repo:sha1'], 'fe16bfbff4e31fcf726c18fe4051b71ee8c96150');
        assert.strictEqual(metadata['tiff:imageWidth'], 512);
        assert.strictEqual(metadata['tiff:imageHeight'], 288);

        // now not a real image so getting the image width and height will fail
        fs.writeFileSync("/rendition11.png", 'hello world');
        rendition = new Rendition(instructions, directory, 11);
        metadata = await rendition.metadata();
        assert.ok(!metadata['tiff:imageWidth']);
        assert.ok(!metadata['tiff:imageHeight']);
    });

    it('verifies function renditionFilename', function () {
        let extension;
        let index;
        assert.strictEqual(Rendition.renditionFilename(extension, index), "rendition0");
        extension = 'png';
        index = 1;
        assert.strictEqual(Rendition.renditionFilename(extension, index), "rendition1.png");
        index = 100;
        extension = "tif";
        assert.strictEqual(Rendition.renditionFilename(extension, index), "rendition100.tif");
    });
    it('verifies function forEach', function () {
        const outDirectory = "out";
        const renditionInstructions = [
            { "fmt": "png" },
            { "fmt": "jpeg" }
        ];
        const renditions = Rendition.forEach(renditionInstructions, outDirectory);
        assert.strictEqual(renditions.length, 2);
        assert.strictEqual(renditions[0].directory, outDirectory);
        assert.strictEqual(renditions[1].directory, outDirectory);
        assert.strictEqual(renditions[0].name, "rendition0.png");
        assert.strictEqual(renditions[1].name, "rendition1.jpeg");
        assert.strictEqual(renditions[0].path, "out/rendition0.png");
        assert.strictEqual(renditions[1].path, "out/rendition1.jpeg");
        assert.strictEqual(renditions[0].index, 0);
        assert.strictEqual(renditions[1].index, 1);
        assert.strictEqual(renditions[0].instructions.fmt, "png");
        assert.strictEqual(renditions[1].instructions.fmt, "jpeg");
    });
});