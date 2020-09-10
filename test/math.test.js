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
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, undefined);
    });

    it("returns an empty dimensions object when called with incorrect or empty params", () => {
        let dimensions = new Dimensions({});
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, undefined);

        dimensions = new Dimensions(() => { throw new Error(1);});
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, undefined);

        dimensions = new Dimensions([ 200, 300 ]);
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, undefined);
    });

    it("returns a proper dimensions object when called with width and/or height parameters", () => {
        let dimensions = new Dimensions(100, 200);
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, 200);

        dimensions = new Dimensions(1.0, 2.0);
        assert.equal(dimensions.width, 1.0);
        assert.equal(dimensions.height, 2.0);

        dimensions = new Dimensions(100);
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, undefined);

        dimensions = new Dimensions(undefined, 100);
        assert.equal(dimensions.height, 100);
        assert.equal(dimensions.widht, undefined);
    });

    it("returns a proper dimensions object when called with dimensions object", () => {
        const dimensions = new Dimensions({ width: 100, height: 200});
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, 200);
    });

    it("returns a proper dimensions object when called with dimensions like object", () => {
        let dimensions = new Dimensions({ width: 100});
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, undefined);

        dimensions = new Dimensions({ height: 100});
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, 100);

        dimensions = new Dimensions({ height: 100, wid: 200});
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, 100);

        dimensions = new Dimensions({}, 200);
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, 200);

        dimensions = new Dimensions(100, {});
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, undefined);

        dimensions = new Dimensions(100, { width: 200, height: 200});
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, undefined);
    });

    it("scales properly when width and height are defined", () => {
        const dimensions = new Dimensions( 100, 200);
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, 200);

        let scaledDimensions = dimensions.scale(1.0);
        assert.equal(scaledDimensions.width, 100);
        assert.equal(scaledDimensions.height, 200);

        scaledDimensions = dimensions.scale(0.5);
        assert.equal(scaledDimensions.width, 50);
        assert.equal(scaledDimensions.height, 100);

        scaledDimensions = dimensions.scale(0.0);
        assert.equal(scaledDimensions.width, 0);
        assert.equal(scaledDimensions.height, 0);

        scaledDimensions = dimensions.scale();
        assert.equal(scaledDimensions.width, undefined);
        assert.equal(scaledDimensions.height, undefined);
    });

    it("scales properly when one of more of the dimensions are not defined", () => {
        let dimensions = new Dimensions( 100);
        assert.equal(dimensions.width, 100);
        assert.equal(dimensions.height, undefined);

        let scaledDimensions = dimensions.scale(1.0);
        assert.equal(scaledDimensions.width, 100);
        assert.equal(scaledDimensions.height, undefined);

        scaledDimensions = dimensions.scale(0.0);
        assert.equal(scaledDimensions.width, 0);
        assert.equal(scaledDimensions.height, undefined);

        dimensions = new Dimensions();
        assert.equal(dimensions.width, undefined);
        assert.equal(dimensions.height, undefined);

        scaledDimensions = dimensions.scale(1.0);
        assert.equal(scaledDimensions.width, undefined);
        assert.equal(scaledDimensions.height, undefined);

        scaledDimensions = dimensions.scale(0.0);
        assert.equal(scaledDimensions.width, undefined);
        assert.equal(scaledDimensions.height, undefined);

    });

    it("properly fits dimensions in bounding box", () => {
        // bounding box is smaller than original dimensions

        // 1:2 fitting in 1:1
        let dimensions = new Dimensions(100, 200);
        let boundingBox = new Dimensions(50, 50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 25);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 2:1 fitting in 1:1
        dimensions = new Dimensions(200, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 25);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // same aspect ratio: 1:1 fitting in 1:1
        dimensions = new Dimensions(100, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:1 fitting in 1:2
        dimensions = new Dimensions(100, 100);
        boundingBox = new Dimensions(50, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:1 fitting in 2:1
        dimensions = new Dimensions(100, 100);
        boundingBox = new Dimensions(100, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 2:1 fitting in 1:2
        dimensions = new Dimensions(200, 100);
        boundingBox = new Dimensions(50, 100);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 25);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // 1:2 fitting in 2:1
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions(100, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 25);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

    });
    
    it("properly fits dimensions in bounding box with upscaling", () => {
        const dimensions = new Dimensions(100, 200);
        const boundingBox = new Dimensions(1280, 720);
        const fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 360);
        assert.equal(fitDimensions.height, 720);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("properly fits dimensions in bounding box without upscaling", () => {
        const dimensions = new Dimensions(100, 200);
        const boundingBox = new Dimensions(1280, 720);
        const fitDimensions = dimensions.fitBoundingBox(boundingBox, true);
        assert.equal(fitDimensions.width, 100);
        assert.equal(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("bounding box is missing one or more dimensions", () => {
        // missing height, use width to determine scale factor
        let dimensions = new Dimensions(100, 200);
        let boundingBox = new Dimensions(50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 50);
        assert.equal(fitDimensions.height, 100);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // missing width, use height to determine scale factor
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions(undefined, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 25);
        assert.equal(fitDimensions.height, 50);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // missing both, don't fail, just return original dimensions
        dimensions = new Dimensions(100, 200);
        boundingBox = new Dimensions();
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, 100);
        assert.equal(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);

        // bounding box is undefined
        dimensions = new Dimensions(100, 200);
        fitDimensions = dimensions.fitBoundingBox();
        assert.equal(fitDimensions.width, 100);
        assert.equal(fitDimensions.height, 200);
        // check aspect ratio did not change
        assert.equal(dimensions.width / dimensions.height, fitDimensions.width / fitDimensions.height);
    });

    it("dimensions object is missing one or more dimensions, shouldn't throw", () => {
        // missing height
        let dimensions = new Dimensions(100);
        let boundingBox = new Dimensions(50, 50);
        let fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, undefined);
        assert.equal(fitDimensions.height, undefined);

        // missing width
        dimensions = new Dimensions(undefined, 200);
        boundingBox = new Dimensions(50, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, undefined);
        assert.equal(fitDimensions.height, undefined);

        // missing both
        dimensions = new Dimensions();
        boundingBox = new Dimensions(50, 50);
        fitDimensions = dimensions.fitBoundingBox(boundingBox);
        assert.equal(fitDimensions.width, undefined);
        assert.equal(fitDimensions.height, undefined);
    });
});
