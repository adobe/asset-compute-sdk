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
const { Dimensions } = require('../lib/postprocessing/math.js');

describe("math.js", function () {

    it("returns an empty dimensions object when called with nothing", () => {
        const dimensions = new Dimensions();
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, undefined);
    });

    it("returns an empty dimensions object when called with incorrect or empty params", () => {
        let dimensions = new Dimensions({});
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, undefined);

        dimensions = new Dimensions(() => { throw new Error(1);});
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, undefined);

        dimensions = new Dimensions([ 200, 300 ]);
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, undefined);
    });

    it("returns a proper dimensions object when called with width and/or height parameters", () => {
        let dimensions = new Dimensions(100, 200);
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, 200);

        dimensions = new Dimensions(1.0, 2.0);
        assert.strictEqual(dimensions.width, 1.0);
        assert.strictEqual(dimensions.height, 2.0);
        
        // floats are allowed
        dimensions = new Dimensions(1.1, 0.201);
        assert.strictEqual(dimensions.width, 1.1);
        assert.strictEqual(dimensions.height, 0.201);

        dimensions = new Dimensions(100);
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, undefined);

        dimensions = new Dimensions(undefined, 100);
        assert.strictEqual(dimensions.height, 100);
        assert.strictEqual(dimensions.widht, undefined);
    });

    it("returns a proper dimensions object when called with dimensions object", () => {
        const dimensions = new Dimensions({ width: 100, height: 200});
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, 200);
    });

    it("returns a proper dimensions object when called with dimensions like object", () => {
        let dimensions = new Dimensions({ width: 100});
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, undefined);

        dimensions = new Dimensions({ height: 100});
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, 100);

        dimensions = new Dimensions({ height: 100, wid: 200});
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, 100);

        dimensions = new Dimensions({}, 200);
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, 200);

        dimensions = new Dimensions(100, {});
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, undefined);

        dimensions = new Dimensions(100, { width: 200, height: 200});
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, undefined);
    });

    it("scales properly when width and height are defined", () => {
        const dimensions = new Dimensions( 100, 200);
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, 200);

        let scaledDimensions = dimensions.scale(1.0);
        assert.strictEqual(scaledDimensions.width, 100);
        assert.strictEqual(scaledDimensions.height, 200);

        scaledDimensions = dimensions.scale(0.5);
        assert.strictEqual(scaledDimensions.width, 50);
        assert.strictEqual(scaledDimensions.height, 100);

        scaledDimensions = dimensions.scale(0.0);
        assert.strictEqual(scaledDimensions.width, 0);
        assert.strictEqual(scaledDimensions.height, 0);

        scaledDimensions = dimensions.scale();
        assert.ok(Number.isNaN(scaledDimensions.width));
        assert.ok(Number.isNaN(scaledDimensions.height));
    });

    it("scales properly when one of more of the dimensions are not defined", () => {
        let dimensions = new Dimensions( 100);
        assert.strictEqual(dimensions.width, 100);
        assert.strictEqual(dimensions.height, undefined);

        let scaledDimensions = dimensions.scale(1.0);
        assert.strictEqual(scaledDimensions.width, 100);
        assert.ok(Number.isNaN(scaledDimensions.height));

        scaledDimensions = dimensions.scale(0.0);
        assert.strictEqual(scaledDimensions.width, 0);
        assert.ok(Number.isNaN(scaledDimensions.height));

        dimensions = new Dimensions();
        assert.strictEqual(dimensions.width, undefined);
        assert.strictEqual(dimensions.height, undefined);

        scaledDimensions = dimensions.scale(1.0);
        assert.ok(Number.isNaN(scaledDimensions.width));
        assert.ok(Number.isNaN(scaledDimensions.height));

        scaledDimensions = dimensions.scale(0.0);
        assert.ok(Number.isNaN(scaledDimensions.width));
        assert.ok(Number.isNaN(scaledDimensions.height));

    });

    it("scales properly when one of more of the dimensions are a float", () => {
        // floats are allowed
        const dimensions = new Dimensions(1.1, 0.201);
        assert.strictEqual(dimensions.width, 1.1);
        assert.strictEqual(dimensions.height, 0.201);

        let scaledDimensions = dimensions.scale(1.0);
        assert.strictEqual(scaledDimensions.width, 1.1);
        assert.strictEqual(scaledDimensions.height, 0.201);

        scaledDimensions = dimensions.scale(0.0);
        assert.strictEqual(scaledDimensions.width, 0);
        assert.strictEqual(scaledDimensions.height, 0);

        scaledDimensions = dimensions.scale(0.5);
        assert.strictEqual(scaledDimensions.width, 0.55);
        assert.strictEqual(scaledDimensions.height, 0.1005);
    });

    it("properly fits dimensions in bounding box", () => {
        // bounding box is smaller than original dimensions

        // 1:2 fitting in 1:1
        let dimensions = new Dimensions(100, 200);
        let boundingBox = new Dimensions(50, 50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 25);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 2:1 fitting in 1:1
        dimensions = new Dimensions(200, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 25);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // same aspect ratio: 1:1 fitting in 1:1
        dimensions = new Dimensions(100, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:1 fitting in 1:2
        dimensions = new Dimensions(100, 100);
        boundingBox = new Dimensions(50, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:1 fitting in 2:1
        dimensions = new Dimensions(100, 100);
        boundingBox = new Dimensions(100, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 2:1 fitting in 1:2
        dimensions = new Dimensions(200, 100);
        boundingBox = new Dimensions(50, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 25);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:2 fitting in 2:1
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions(100, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 25);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

    });
    
    it("properly fits dimensions in bounding box with upscaling", () => {
        const dimensions = new Dimensions(100, 200);
        const boundingBox = new Dimensions(1280, 720);
        const fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 360);
        assert.strictEqual(fitDimensions.height, 720);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("properly fits dimensions in bounding box without upscaling", () => {
        const dimensions = new Dimensions(100, 200);
        const boundingBox = new Dimensions(1280, 720);
        const fitDimensions = dimensions.fitBoundingBox(boundingBox, true);
        assert.strictEqual(fitDimensions.width, 100);
        assert.strictEqual(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("properly fits dimensions in bounding box when size is less than 1", () => {
        const imageSize = new Dimensions(10, 2500);
        const targetBoundingBox = new Dimensions(48, 48);
        const targetSize = imageSize.fitBoundingBox(targetBoundingBox, true);

        const watermarkSize = new Dimensions(1860, 255);
        const watermarkTargetSize = watermarkSize.fitBoundingBox(targetSize).scale(1.0);
        assert.ok(watermarkTargetSize.width < 1, watermarkSize.height < 1);
        // check aspect ratio did not change
        assert.strictEqual(imageSize.width / imageSize.height, targetSize.width / targetSize.height);
    });

    it("bounding box is missing one or more dimensions", () => {
        // missing height, use width to determine scale factor
        let dimensions = new Dimensions(100, 200);
        let boundingBox = new Dimensions(50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 50);
        assert.strictEqual(fitDimensions.height, 100);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // missing width, use height to determine scale factor
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions(undefined, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 25);
        assert.strictEqual(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // missing both, don't fail, just return original dimensions
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions();
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.strictEqual(fitDimensions.width, 100);
        assert.strictEqual(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // bounding box is undefined
        dimensions = new Dimensions(100, 200);
        fitDimensions = dimensions.fitBoundingBox();
        assert.strictEqual(fitDimensions.width, 100);
        assert.strictEqual(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.strictEqual(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("dimensions object is missing one or more dimensions, shouldn't throw", () => {
        // missing height
        let dimensions = new Dimensions(100);
        let boundingBox = new Dimensions(50, 50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.ok(Number.isNaN(fitDimensions.width));
        assert.ok(Number.isNaN(fitDimensions.height));

        // missing width
        dimensions = new Dimensions(undefined, 200);
        boundingBox = new Dimensions(50, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.ok(Number.isNaN(fitDimensions.width));
        assert.ok(Number.isNaN(fitDimensions.height));

        // missing both
        dimensions = new Dimensions();
        boundingBox = new Dimensions(50, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.ok(Number.isNaN(fitDimensions.width));
        assert.ok(Number.isNaN(fitDimensions.height));
    });
});
