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

class Dimensions {
    constructor(width, height) {
        // if width is Dimension or Dimension like, clone it
        if (width && (width.width || width.height)) {
            this.width = Number.isFinite(width.width)? width.width: undefined;
            this.height = Number.isFinite(width.height)? width.height: undefined;
        } else {
            this.width = Number.isFinite(width)? width: undefined;
            this.height = Number.isFinite(height)? height: undefined;
        }
    }

    scale(factor) {
        return new Dimensions(this.width * factor, this.height * factor);
    }

    fitBoundingBox(boundingBox={}, preventUpscaling) {
        let scaleFactor;
        if (boundingBox.width && boundingBox.height) {
            scaleFactor = Math.min( 
                boundingBox.width / this.width, 
                boundingBox.height / this.height
            );
        } else if (boundingBox.width) {
            scaleFactor = boundingBox.width / this.width;
        } else if (boundingBox.height) {
            scaleFactor = boundingBox.height / this.height;
        } else {
            // keep original size if no bounding box defined
            return this;
        }

        if (preventUpscaling) {
            scaleFactor = Math.min(1.0, scaleFactor);
        }
        return this.scale(scaleFactor);
    }
}

module.exports = {
    Dimensions
};
