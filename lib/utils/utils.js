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

module.exports = {
    durationSec,
    timeUntilActivationTimeout,
    setConsoleLogPrefix
};