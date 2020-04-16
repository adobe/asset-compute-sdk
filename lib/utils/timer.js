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

const process = require('process');

// Simple timer making process.hrtime() easy to use
class Timer {
    constructor() {
        this.id = process.hrtime();
    }

    end() {
        if (!this.hrtimeElapsed) {
            try {
                this.hrtimeElapsed = process.hrtime(this.id);
            } catch (e) {
                console.error("error getting timing metrics:", e.message || e);
            }
        }
        return hrtimeToSeconds(this.hrtimeElapsed);
    }

    // end() and duration() do the same, end the timer if not ended yet and return the duration
    // but to the client it reads nicer depending on what they want
    duration() {
        return this.end();
    }

    durationSec() {
        return this.end().toFixed(3);
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