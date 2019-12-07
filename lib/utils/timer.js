/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2018 Adobe Systems Incorporated
 *  All Rights Reserved.
 *
 *  NOTICE:  All information contained herein is, and remains
 *  the property of Adobe Systems Incorporated and its suppliers,
 *  if any.  The intellectual and technical concepts contained
 *  herein are proprietary to Adobe Systems Incorporated and its
 *  suppliers and are protected by trade secret or copyright law.
 *  Dissemination of this information or reproduction of this material
 *  is strictly forbidden unless prior written permission is obtained
 *  from Adobe Systems Incorporated.
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
        return this.duration();
    }

    duration() {
        if (this.hrtimeElapsed) {
            return hrtimeToSeconds(this.hrtimeElapsed);
        }
        return hrtimeToSeconds(process.hrtime(this.id));
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