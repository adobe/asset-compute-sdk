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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const assert = require('assert');
const sinon = require('sinon');

const {removeTimers} = require('../lib/cleanup');

describe('cleanup tests for timers', () => {
    let clock;
    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });

    afterEach(() => {
        clock.restore();
    });
    it('does nothing when there are no timers set', () => {
        sinon.spy(clock, "clearTimeout");

        const scheduledEvents = []; 
        const result = removeTimers(scheduledEvents);
        assert.equal(result.length, 0);

        sinon.assert.notCalled(clock.clearTimeout);
    });

    it('stops scheduled timers', () => {
        const spy = sinon.spy(clock, "clearTimeout");

        const scheduledEvents = [ 42, 404, 1337 ]; 
        const result = removeTimers(scheduledEvents);
        assert.equal(result.length, 0);

        sinon.assert.calledWith(spy.firstCall, 42);
        sinon.assert.calledWith(spy.secondCall, 404);
        sinon.assert.calledWith(spy.thirdCall, 1337);
    });
});
