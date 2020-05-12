/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

'use strict';


const path = require('canonical-path');
const fse = require('fs-extra');

const WORK_DIRECTORY = "work";
const IN_DIRECTORY = "in";
const OUT_DIRECTORY = "out";

async function createDirectories() {
    if (process.env.WORKER_TEST_MODE) {
        return {
            in: "/in",
            out: "/out"
        };
    }

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
    directories.base = path.resolve(WORK_DIRECTORY, (process.env.__OW_ACTIVATION_ID || Date.now().toString()));
    directories.in   = path.resolve(directories.base, IN_DIRECTORY);
    directories.out  = path.resolve(directories.base, OUT_DIRECTORY);

    console.log(`work directory        : ${directories.base}`);
    console.log(`- source directory    : ${directories.in}`);
    console.log(`- renditions directory: ${directories.out}`);

    // clean work directory if it might exist already
    await fse.remove(directories.base);

    await fse.mkdirs(directories.in);
    await fse.mkdirs(directories.out);

    return directories;
}

// should never rethrow errors (called in catch portions of try/catch)
async function cleanupDirectories(directories) {
    if (directories && directories.base) {
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
}