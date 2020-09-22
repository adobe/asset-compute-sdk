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

// This is a simple dummy worker used to test the worker

const { worker } = require('../index');
const gm = require('../lib/postprocessing/gm-promisify');

const fs = require('fs').promises;

process.env.OPENWHISK_NEWRELIC_DISABLE_METRICS = true;
process.env.SDK_POST_PROCESSING_TEST_MODE = true;

exports.main = worker(async (source, rendition) => {
    // run custom imagemagick convert command to simulate a tool creating an intermediate rendition
    if (rendition.instructions.imagemagick) {
        console.log(`[test worker] imagemagick: convert ${source.path} ${rendition.instructions.imagemagick} ${rendition.path}`);
        const img = gm(source.path);
        for (const arg of rendition.instructions.imagemagick.split(" ")) {
            if (arg.length > 0) {
                img.out(arg);
            }
        }
        await img.write(rendition.path);

    } else {
        console.log(`[test worker] copying source to rendition: ${source.path} to ${rendition.path}`);
        // simple case where post processing just runs on the source files for basic tests
        // symlink source to rendition to transfer 1:1
        await fs.symlink(source.path, rendition.path);
    }

    rendition.postProcess = true;
});