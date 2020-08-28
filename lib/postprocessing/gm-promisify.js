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

const GM = require("gm").subClass({ imageMagick: !process.env.GM_USE_GRAPHICSMAGICK });
const util = require("util");

function wrapAndPromisify(obj, fnName) {
    const originalFn = obj[fnName].bind(obj);
    obj[fnName] = util.promisify(originalFn);
}

function gm(...arg) {
    const img = GM(...arg);

    // promisify gm output functions with callbacks
    wrapAndPromisify(img, "write");
    wrapAndPromisify(img, "stream");
    wrapAndPromisify(img, "toBuffer");
    wrapAndPromisify(img, "compare");
    wrapAndPromisify(img, "thumb");
    wrapAndPromisify(img, "format");
    wrapAndPromisify(img, "identify");

    return img;
}

module.exports = gm;