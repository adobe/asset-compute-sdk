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

const imagePostProcess = require('../lib/postprocessing/image');
const assert = require('assert');
const fs = require("fs-extra");
const path = require("path");

describe("imagePostProcess watermark", () => {
    beforeEach(async function () {
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
        await fs.mkdirs('build');
        await fs.mkdirs('build/work');
    });

    afterEach(() => {
        delete process.env.WORKER_BASE_DIRECTORY;
        delete process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG;
    });

    it('should convert PNG to JPG', async () => {
        const rendition = './test/files/file.png';
        const instructions = {
            fmt: 'jpg',
            path: rendition
        };
        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'png-to-jpg-rendition.jpg');
        const result = await imagePostProcess(rendition, out, instructions);
        //assert.ok(result);

        // compare files by buffer
        const expectedFile = await fs.readFile('./test/files/test-renditions/png-to-jpg-rendition.jpg');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it('should add a watermark to a JPG file', async () => {
        /*
        watermark-
            width: 676
            height: 981
        rendition(./test/files/file.jpg)-
            width: 512
            height: 743
        new resize-watermark:
            width: 198
            height: 288
        */
        const rendition = './test/files/file.jpg';
        const instructions = {
            "fmt": "jpg",
            path: rendition,
            "watermark": {
                "name": "watermark",
                "placement": "Center",
                "path": "test/files/watermark-vertical.png",
                "widthPercent": 100
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'post-watermark-rendition.jpg');
        const result = await imagePostProcess(rendition, out, instructions);
        // assert.ok(result);

        // compare files by buffer
        const expectedFile = await fs.readFile('./test/files/test-renditions/renditionwithwatermark-rectangle-vertical.jpg');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it('should add a watermark to a PNG file (preserve transparency)', async () => {
        process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG = true;
        // png files contain chunks of metadata. To do binary comparision, we need to remove all variability.
        const rendition = './test/files/file-with-transparency.png';
        const instructions = {
            "fmt": "png",
            "path": rendition,
            "watermark": {
                "name": "watermark",
                "placement": "Center",
                "path": "test/files/watermark-vertical.png",
                "widthPercent": 75
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'post-watermark-rendition.png');
        const result = await imagePostProcess(rendition, out, instructions);
        // assert.ok(result);

        // compare files by buffer
        const expectedFile = await fs.readFile('./test/files/test-renditions/vertical-watermark-from-transparency-rendition.png');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it('should add a watermark to a TIFF file (preserve transparency)', async () => {
        process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG = true;
        // png files contain chunks of metadata. To do binary comparision, we need to remove all variability.
        const rendition = './test/files/file-with-transparency.tiff';
        const instructions = {
            "fmt": "png",
            "path": rendition,
            "watermark": {
                "name": "watermark",
                "placement": "Center",
                "path": "test/files/watermark-vertical.png",
                "widthPercent": 60
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'watermark-from-tiff-transparency-rendition.png');
        const result = await imagePostProcess(rendition, out, instructions);
        // assert.ok(result);

        // compare files by buffer
        const expectedFile = await fs.readFile('./test/files/test-renditions/vertical-watermark-from-tiff-transparency-rendition.png');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it('should add a watermark to a PNG file and save a JPG', async () => {

        const rendition = './test/files/file-with-transparency.png';
        const instructions = {
            "fmt": "jpg",
            "path": rendition,
            "watermark": {
                "name": "watermark",
                "placement": "Center",
                "path": "test/files/watermark-vertical.png",
                "widthPercent": 75
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'watermark-rendition.jpg');
        const result = await imagePostProcess(rendition, out, instructions);
        // assert.ok(result);

        // compare files by buffer
        // note that forcing to save as jpg will loose the transparency
        const expectedFile = await fs.readFile('./test/files/test-renditions/vertical-watermark-from-transparency-rendition.jpg');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it('should add a watermark to a TIFF file and save a JPG', async () => {
        process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG = true;
        
        const rendition = './test/files/file-with-transparency.tiff';
        const instructions = {
            "fmt": "jpg",
            "path": rendition,
            "watermark": {
                "name": "watermark",
                "placement": "Center",
                "path": "test/files/watermark-vertical.png",
                "widthPercent": 25
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'watermark-from-tiff-transparency-rendition.jpg');
        const result = await imagePostProcess(rendition, out, instructions);
        // assert.ok(result);

        // compare files by buffer
        // note that forcing to save as jpg will loose the transparency
        const expectedFile = await fs.readFile('./test/files/test-renditions/vertical-watermark-from-tiff-transparency-rendition.jpg');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });

    it.skip('should add an embedded watermark to a PNG file and save a JPG', async () => {
        // base64 file should have already be downloaded to an img file
        const base64Watermark = 'data:image/png;base64,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';

        const instructions = {
            "fmt": "jpg",
            "watermark": {
                "placement": "Center",
                "visibilityPercentage": 75,
                "watermarkContent": base64Watermark,
                "isEmbedded": true
            }
        };

        const out = path.join(process.env.WORKER_BASE_DIRECTORY, 'watermark-rendition.jpg');
        const result = await imagePostProcess('./test/files/file-with-transparency.png', out, instructions);
        assert.ok(result);

        // compare files by buffer
        // note that forcing to save as jpg will loose the transparency
        const expectedFile = await fs.readFile('./test/files/test-renditions/watermark-from-transparency-rendition.jpg');
        const outFile = await fs.readFile(out);
        assert.ok((expectedFile).equals(outFile));

        // remove rendition from after success
        await fs.remove(out);
    });
});
