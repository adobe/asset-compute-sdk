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

const path = require('path');
const fse = require('fs-extra');

const IN_DIRECTORY = "in";
const OUT_DIRECTORY = "out";
const WORK_DIRECTORY = "work";

async function createDirectories() {
    // all relative to current directory,
    // inside openwhisk nodejs container this would be:
    //
    //    /nodejsAction/xyz123

    // structure we create underneath the current dir:
    //
    //     work/
    //       <activationid>/   <- base
    //         in/             <- in
    //         out/            <- out

    const directories = {};

    const baseLocation = process.env.WORKER_BASE_DIRECTORY || WORK_DIRECTORY;
    directories.base = path.resolve(baseLocation, (process.env.__OW_ACTIVATION_ID || Date.now().toString()));

    directories.in   = path.resolve(directories.base, IN_DIRECTORY);
    directories.out  = path.resolve(directories.base, OUT_DIRECTORY);

    console.log(`work directory        : ${directories.base}`);
    console.log(`- source directory    : ${directories.in}`);
    console.log(`- renditions directory: ${directories.out}`);

    // clean work directory if it might exist already
    await fse.remove(directories.base);

    await fse.mkdirs(directories.in);
    await fse.mkdirs(directories.out);

    // for test-worker framework, input and output are mounted at /in and /out
    // random access reading and writing from that mount can be problematic on Docker for Mac at least,
    // so we are copying all files over into the container
    if (process.env.WORKER_TEST_MODE) {
        try {
            await fse.copy("/in", directories.in);
        } catch (e) {
            // sometimes this fails sporadically for unknown reason, so we retry once
            console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed, retrying... (${e.message})`);
            try {
                await fse.copy("/in", directories.in);
            } catch (e) {
                console.log(`WORKER_TEST_MODE: copying /in to ${directories.in} failed:`);
                throw e;
            }
        }
    }

    return directories;
}

// should never rethrow errors (called in catch portions of try/catch)
async function cleanupDirectories(directories) {
    if (directories && directories.base) {

        // test-worker framework: copy rendition results to /out mount
        if (process.env.WORKER_TEST_MODE) {
            await fse.copy(directories.out, "/out", {
                // Make sure symlinks are copied as binaries and not symlinks
                dereference: true,

                // ensure files can be read by host system by running chmod before copy
                filter: src => {
                    fse.chmodSync(src, 0o766);
                    return true;
                }
            });
        }

        // should also remove metadata (error and mimetype) files, if not already cleaned
        try {
            await fse.remove(directories.base);
        } catch (err) {
            console.error(`Error while cleaning up work directories: ${err.message || err}`);
            return false;
        }
    }
    return true;
}

module.exports = {
    createDirectories,
    cleanupDirectories
};
