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
const fs = require('fs-extra');
const mockFs = require('mock-fs');
const Rendition = require('../lib/rendition.js');
const { GenericError } = require('@adobe/asset-compute-commons');

const filePath = "test/files/file.png";
const PNG_CONTENTS = fs.readFileSync(filePath);
const PNG_SIZE = fs.statSync(filePath).size;

const filePathSmall = "test/files/fileSmall.png";
const SMALL_PNG_CONTENTS = fs.readFileSync(filePathSmall);

const DATA_URI_CONTENTS = "hello world";
const DATA_URI = "data:text/plain;charset=utf-8;base64,aGVsbG8gd29ybGQ="; // data uri with text: "hello world"
const EMBED_LIMIT_MAX = 32 * 1024;

describe("rendition.js", () => {
    beforeEach(() => {
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
        assert.strictEqual(await rendition.sha1(), 'fe16bfbff4e31fcf726c18fe4051b71ee8c96150');

        // second call (cached) returns the same sha1
        assert.strictEqual(await rendition.sha1(), 'fe16bfbff4e31fcf726c18fe4051b71ee8c96150');
    });

    it('verifies method sha1 handles not finding the file', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);

        try{
            const rendition = new Rendition(instructions, directory, 11);
            await fs.remove("/rendition11.png");

            await rendition.sha1();

            assert.fail("Should have failed to create a hash");
        } catch (err){
            assert.ok(err.toString().includes("creating sha1 hash failed"));
        }
    });
    
    it('verifies method id works properly', function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        let rendition = new Rendition(instructions, directory, 11);
        assert.strictEqual(rendition.id(), 11);

        // rendition.id differs depending upon whether instructions.name is set or not
        instructions.name = "idName";
        rendition = new Rendition(instructions, directory);
        assert.strictEqual(rendition.id(), "idName");
    });

    it('verifies method instructionsForEvent works properly', function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        const inst = rendition.instructionsForEvent();
        assert.ok(!inst.target);
        assert.strictEqual(inst.fmt, "png");
    });

    it('verifies metadata works properly', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile("/rendition11.png", PNG_CONTENTS);
        let rendition = new Rendition(instructions, directory, 11);
        let metadata = await rendition.metadata();

        // metadata we got through cmd file call will not work here (mockFs messes it up)
        assert.strictEqual(metadata["repo:size"], 193011);
        assert.strictEqual(metadata["repo:sha1"], "fe16bfbff4e31fcf726c18fe4051b71ee8c96150");
        assert.strictEqual(metadata["tiff:imageWidth"], 512);
        assert.strictEqual(metadata["tiff:imageHeight"], 288);

        // now not a real image so getting the image width and height will fail
        fs.writeFileSync("/rendition11.png", 'hello world');
        rendition = new Rendition(instructions, directory, 11);
        metadata = await rendition.metadata();
        assert.strictEqual(metadata["repo:size"], 11);
        assert.strictEqual(metadata["repo:sha1"], "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");
    });

    it('verifies metadata from missing file does not fail', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 12);
        const metadata = await rendition.metadata();
        assert.deepStrictEqual(metadata, {});
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

    it('can set mimetype+encoding (for image)', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("image/jpeg", "binary");

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, "image/jpeg");

        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, null);

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "image/jpeg");
    });

    it('can set mimetype+encoding (for text)', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("txt/plain", "ascii");

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, "txt/plain");

        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, "ascii");

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "txt/plain; charset=ascii");
    });

    it.skip('can set mimetype+boundary (for multipart)', async function () {
        // skip - sdk not handling boundaries currently since there should be no multipart rendition
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("multipart/form-data", null, "something");

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, "multipart/form-data");

        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, null);

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "multipart/form-data; boundary=something");
    });

    it('does not set boundary if mime type is not multipart (no encoding)', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("unknown/form-data", null, "something");

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, "unknown/form-data");

        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, null);

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "unknown/form-data");
    });

    it('does not set boundary if mime type is not multipart (with encoding)', async function () {
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("unknown/form-data", "ascii", "something");

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, "unknown/form-data");

        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, "ascii");

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "unknown/form-data; charset=ascii");
    });

    it('handles gracefully reading incomplete data for mime+encoding', async function () {
        const mimeInfoFilepath = "/test-mimeinfo-file.txt";
        const instructions = { "fmt": "png", "target": "TargetName" };
        const directory = "/";
        await fs.writeFile(mimeInfoFilepath, "image/jpeg");
        const rendition = new Rendition(instructions, directory, 11);

        const mime = await rendition.mimeType();
        assert.strictEqual(mime, null);
        
        const encoding = await rendition.encoding();
        assert.strictEqual(encoding, null);

        const contentType = await rendition.contentType();
        assert.strictEqual(contentType, "application/octet-stream");
    });

    it('should embed rendition because it is small enough', async function () {
        // should embed because small enough
        const instructions = { "fmt": "png", "target": "TargetName", embedBinaryLimit: EMBED_LIMIT_MAX };
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);

        await fs.writeFile("/rendition11.png", SMALL_PNG_CONTENTS);
        const shouldEmbed = rendition.shouldEmbedInIOEvent();
        assert.strictEqual(shouldEmbed, true);
    });

    it('should not embed rendition if not specified in instructions', async function () {
        const instructions = { "fmt": "png", "target": "TargetName"};
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);

        await fs.writeFile("/rendition11.png", SMALL_PNG_CONTENTS);
        const shouldEmbed = rendition.shouldEmbedInIOEvent();
        assert.strictEqual(shouldEmbed, false);
    });

    it('should not embed rendition if rendition is larger than defined limit', async function () {
        const instructions = { "fmt": "png", "target": "TargetName", embedBinaryLimit: 1};
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);

        await fs.writeFile("/rendition11.png", SMALL_PNG_CONTENTS);
        const shouldEmbed = rendition.shouldEmbedInIOEvent();
        assert.strictEqual(shouldEmbed, false);
    });

    it('should create a data uri', async function () {
        const instructions = { "fmt": "txt", "target": "TargetName", embedBinaryLimit: 1};
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        rendition.setContentType("text/plain", "utf-8");

        await fs.writeFile("/rendition11.txt", DATA_URI_CONTENTS);
        const dataUri = await rendition.asDataUri();
        assert.equal(dataUri, DATA_URI);
    });

    it('should not create a data uri because the rendition is too large', async function () {
        const instructions = { "fmt": "txt", "target": "TargetName", embedBinaryLimit: 1};
        const directory = "/";
        const rendition = new Rendition(instructions, directory, 11);
        // mock size function to make size larger than DATA_URI_LIMIT
        rendition.size = function() {
            return 3000000;
        };

        await fs.writeFile("/rendition11.txt", PNG_CONTENTS);
        try {
            await rendition.asDataUri();
            assert.fail("Should have failed");
        } catch (e) {
            assert.ok(e instanceof GenericError);
        }
    });
});
