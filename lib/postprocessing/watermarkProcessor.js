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

'use strict';

const { getDimensions } = require('./assetProperties');
const { ImageOperations } = require('./imageOperations');

class WatermarkProcessor {
    constructor(instructions) {

        console.log("IN", instructions);

        this.renditionWidth = instructions.width || this.getRenditionDimensions(instructions.path).width || 0;
        this.renditionHeight = instructions.height || this.getRenditionDimensions(instructions.path).height || 0;

        this.watermarkWidthPercent = instructions.watermark.widthPercent || 100;
        this.watermarkPath = instructions.watermark.path;
        this.getWatermarkDimensions(this.watermarkPath);
    }

    getRenditionDimensions (path) {
        const ph = require('path');
        console.log('path---------->',path);
        console.log('resolve path---------->',ph.resolve(path));
        return getDimensions(path);
    }

    getWatermarkDimensions (path) {
        const dimensions = getDimensions(path);
        this.watermarkWidth = dimensions.width;
        this.watermarkHeight = dimensions.height;
    }

    compareRenditionWidth () {
        console.log("renditionWidth" + this.renditionWidth + "<=" +  "watermarkWidth" + this.watermarkWidth );
        if( this.renditionWidth <= this.watermarkWidth ) {
            return this.renditionWidth;
        }
        return 0;
    }

    compareRenditionHeight () {

        console.log("HHHH", `rendition ${this.renditionHeight} <= water ${this.watermarkHeight}`);

        if (this.renditionHeight <= this.watermarkHeight) {
            return this.renditionHeight;
        }
        return 0;
    }

    async fitWatermark(destinationAsset){

        const resizedAsset = destinationAsset || this.watermarkPath.replace("watermark", "watermark-resized");
        const img = new ImageOperations(this.watermarkPath);

        this.getWatermarkDimensions(this.watermarkPath);
        console.log("width start: " + this.watermarkWidth);
        console.log("height start: " + this.watermarkHeight);

        const watermarkWidthResize = this.compareRenditionWidth();

        if (watermarkWidthResize > 0) {
            console.log("Resize W:", watermarkWidthResize);

            img.resize(watermarkWidthResize);
        }

        await img.write(resizedAsset);

        this.getWatermarkDimensions(resizedAsset);
        console.log("width: " + this.watermarkWidth);
        console.log("height: " + this.watermarkHeight);

        const watermarkHeightResize = this.compareRenditionHeight();
        if (watermarkHeightResize > 0) {
            console.log("Resize H:", watermarkHeightResize);
            const img = new ImageOperations(this.watermarkPath);
            img.resize(null, watermarkHeightResize);
            await img.write(resizedAsset);
        }

        //shrink
        if (this.watermarkWidthPercent < 100) {

            this.getWatermarkDimensions(resizedAsset);
            console.log("width: " + this.watermarkWidth);
            console.log("height: " + this.watermarkHeight);

            const percent = (this.watermarkWidth * .01);

            const shrink = (this.watermarkWidthPercent * percent);

            console.log("%", percent);
            console.log("shrink %", shrink);

            const img = new ImageOperations(resizedAsset);
            img.resize(shrink);
            await img.write(resizedAsset);
        }

        this.getWatermarkDimensions(resizedAsset);
        console.log("new width: " + this.watermarkWidth);
        console.log("new height: " + this.watermarkHeight);
    }
}

module.exports = {
    WatermarkProcessor
};
