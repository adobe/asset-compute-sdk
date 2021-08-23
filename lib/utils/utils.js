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

const fs = require('fs-extra');

// place for small utilities. larger parts should move into their own module.

const DEFAULT_METRIC_TIMEOUT_MS = 60000; // default openwhisk action timeout

/**
 * Returns the time delta between two unix epoch timestamps in seconds
 *
 * @param {Number} start start time in unix epoch (millis), as can be parsed by new Date(x)
 * @param {Number} end end time in unix epoch (millis), as can be parsed by new Date(x)
 * @returns {Number} delta in seconds
 */
function durationSec(start, end) {
    if (start === undefined || end === undefined) {
        return undefined;
    }
    if (!(start instanceof Date)) {
        start = new Date(start);
    }
    if (!(end instanceof Date)) {
        end = new Date(end);
    }
    return (end - start) / 1000;
}

/**
 * Returns the time left in milliseconds until the current OpenWhisk activation times out.
 */
function timeUntilActivationTimeout() {
    // use same timeout logic as `@adobe/node-openwhisk-newrelic`: https://github.com/adobe/node-openwhisk-newrelic/blob/master/lib/metrics.js#L38-L44
    return (process.env.__OW_DEADLINE - Date.now()) || DEFAULT_METRIC_TIMEOUT_MS;
}

/**
 * Adds a prefix to all console.log() messages. To remove the prefix again, call without an argument.
 * Note there will be a space between the prefix and the message.
 * @param {String} prefix string to add before all console.log messages. leave out to reset
 */
function setConsoleLogPrefix(prefix) {
    if (!prefix) {
        console.log = console._originalLog || console.log;
        return;
    }

    if (!console._originalLog) {
        console._originalLog = console.log;
    }

    console.log = (...args) => {
        console._originalLog(prefix, ...args);
    };
}

// This should be roughly similar to ARG_MAX, some systems is 131072 bytes
// but we're going to be very conservative and cap the total size much lower than that to be safe.
// POSIX suggestion is to go 2048 lower than the ARG_MAX value, as per https://www.in-ulm.de/~mascheck/various/argmax/
const CMD_SIZE_LIMIT = 128 * 1024;
const VAR_PATH = "./vars";

/**
 * Only allows a specific number of bytes for variable names and values.  Any variable exceeding that will be stored in a file
 * and the variable value will contain the temp file location.
 * If this substitution occurs then an additional variable called FILE_PARAMS will contain the list of substituted variable names.
 * @param {Object} vars 
 * @param {Number} sizeLimit Size limit to uphold (number of bytes)
 * @returns Object of values from the provided one, modified as described.
 */
function limitVariableSizes(vars, sizeLimit = CMD_SIZE_LIMIT) {
    const sizeLimitedVars = {};
    for (const key in vars) {
        const size = String(key).length + String(vars[key]).length;
        if (size >= sizeLimit) {
            // We have hit our limit and all variables must be stored in temp files now
            fs.mkdirpSync(VAR_PATH);
            // We want to salt the temp file name to avoid any chances of collision, however unlikely.
            // Generate a random sequence of digits using [0-9A-Za-z] and pick 6 characters out of it.
            // First two characters are always '1.' so we start with 2.
            const tmpFile = `${VAR_PATH}/var-${key}-${(Math.random() + 1).toString(36).substring(2,8)}`;
            fs.writeFileSync(tmpFile, vars[key]);
            sizeLimitedVars[key] = tmpFile;
            // Now indicate that variable is a file path
            const fileParams = sizeLimitedVars.FILE_PARAMS || [];
            fileParams.push(key);
            sizeLimitedVars.FILE_PARAMS = fileParams;
        } else {
            // We are still within the limit
            sizeLimitedVars[key] = vars[key];
        }
    }
    return sizeLimitedVars;
}

module.exports = {
    durationSec,
    timeUntilActivationTimeout,
    setConsoleLogPrefix,
    limitVariableSizes,
    CMD_SIZE_LIMIT
};