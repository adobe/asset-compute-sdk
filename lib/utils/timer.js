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

const process = require('process');

// Simple timer making process.hrtime() easy to use
class Timer {
    // creates a timer. use start() to start measurements
    constructor() {
        this._measured = false;
        this._current = 0.0;
        this._total = 0.0;
    }

    // starts or continues the timer
    start() {
        if (!this._id) {
            this._id = process.hrtime();

            this._measured = true;
        }
        return this;
    }

    // stops the timer if it was running and returns the total time in seconds as float
    stop() {
        if (this._id) {
            try {
                this._current = hrtimeToSeconds(process.hrtime(this._id));
                this._total += this._current;
            } catch (e) {
                console.log("error getting timing metrics:", e.message || e);
            }

            delete this._id;
        }
    }

    // returns the duration between the last start() and stop().
    // stops timer first if it is currently running.
    // returns seconds as float. if the timer never ran, it returns undefined
    currentDuration() {
        this.stop();
        return this._measured ? this._current : undefined;
    }

    // returns the total duration between all start() and stop() calls.
    // stops timer first if it is currently running.
    // returns seconds as float. if the timer never ran, it returns undefined
    totalDuration() {
        this.stop();
        return this._measured ? this._total : undefined;
    }

    // returns a human readable representation of the currentDuration() in seconds with 3 decimal precision
    toString() {
        this.stop();
        return this._measured ? this._current.toFixed(3) : "???";
    }

    // sums multiple timer's currentDuration() and skips undefined values
    static currentSum(...timers) {
        let sum = 0.0;
        timers.forEach(timer => {
            const d = timer.currentDuration();
            if (d !== undefined) {
                sum += d;
            }
        });
        return sum;
    }

    // sums multiple timer's totalDuration() and skips undefined values
    static totalSum(...timers) {
        let sum = 0.0;
        timers.forEach(timer => {
            const d = timer.totalDuration();
            if (d !== undefined) {
                sum += d;
            }
        });
        return sum;
    }
}

function hrtimeToSeconds(hrtime) {
    if (!hrtime || !hrtime.length === 2) {
        return -1;
    }
    // hrtime is an array [seconds, nanoseconds]
    return (hrtime[0] + (hrtime[1] / 1e9));
}

module.exports = Timer;
