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
const fs = require("fs-extra");
const path = require("path");

const { WatermarkProcessor } = require('../../lib/postprocessing/watermarkProcessor');
const { getDimensions } = require('../../lib/postprocessing/assetProperties');

describe("watermarkProcessor.js", () => {
    beforeEach(async function () {
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
        await fs.mkdirs('build/work', { recursive: true });
    });

    afterEach(() => {
        delete process.env.WORKER_BASE_DIRECTORY;
        delete process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG;
    });

    describe('resizing', () => {
        it('valid - square widthPercent at 100% ', async () => {

            const watermark = "./test/files/watermark.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-square-100.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);
            assert.strictEqual(dimensions.width, 100, "Width size incorrect");
            assert.strictEqual(dimensions.height, 100, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - rectangle width 50 widthPercent at 100% ', async () => {

            const watermark = "./test/files/watermark.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-width-50.png`;
            const renditionInstructions = {
                width: 50,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);
            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 50, "height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - rectangle height 50 widthPercent at 100% ', async () => {

            const watermark = "./test/files/watermark.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-height-50.png`;
            const renditionInstructions = {
                width: 100,
                height: 50,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);
            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 50, "height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square widthPercent at 50% ', async () => {

            const watermark = "./test/files/watermark.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-square-50.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);
            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 50, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square widthPercent at 0 ', async () => {

            const watermark = "./test/files/watermark.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-square-0.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 0
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);
            assert.strictEqual(dimensions.width, 100, "Width size incorrect");
            assert.strictEqual(dimensions.height, 100, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square with horizontal rectangle', async () => {

            const watermark = "./test/files/watermark-horizontal.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-horizontal.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 100, "Width size incorrect");
            assert.strictEqual(dimensions.height, 69, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square with horizontal rectangle widthPercent at 50%', async () => {

            const watermark = "./test/files/watermark-horizontal.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-horizontal-50.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 35, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square with vertical rectangle', async () => {

            const watermark = "./test/files/watermark-vertical.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-vertical.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 69, "Width size incorrect");
            assert.strictEqual(dimensions.height, 100, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - square with vertical rectangle widthPercent at 50%', async () => {

            const watermark = "./test/files/watermark-vertical.png";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rectangle-vertical-50.png`;
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 35, "Width size incorrect");
            assert.strictEqual(dimensions.height, 51, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - no rendition width or height', async () => {

            const watermark = "./test/files/watermark.png";
            const rendition = "./test/files/file.jpg";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rendition-no-width-height.png`;
            const renditionInstructions = {
                path: rendition,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 125, "Width size incorrect");
            assert.strictEqual(dimensions.height, 125, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - no rendition height', async () => {

            const watermark = "./test/files/watermark.png";
            const rendition = "./test/files/file.jpg";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rendition-no-height.png`;
            const renditionInstructions = {
                path: rendition,
                width: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 50, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('valid - no rendition width', async () => {

            const watermark = "./test/files/watermark.png";
            const rendition = "./test/files/file.jpg";
            const destination = `${process.env.WORKER_BASE_DIRECTORY}/watermark-rendition-no-width.png`;
            const renditionInstructions = {
                path: rendition,
                width: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 50
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);
            await assetResized.fitWatermark(destination);

            const dimensions = getDimensions(destination);

            assert.strictEqual(dimensions.width, 50, "Width size incorrect");
            assert.strictEqual(dimensions.height, 50, "Height size incorrect");

            fs.unlinkSync(destination);
        });

        it('invalid - unreachable path for resized watermark asset ', async () => {

            const watermark = "./test/files/watermark.png";
            const renditionInstructions = {
                width: 100,
                height: 100,
                watermark: {
                    path: watermark,
                    widthPercent: 100
                }
            };

            const assetResized = new WatermarkProcessor(renditionInstructions);

            try {
                await assetResized.fitWatermark("./testXXXXX/files/watermark.png");
            } catch (err) {
console.log("ERR", err)

            }

        });
    });

});
