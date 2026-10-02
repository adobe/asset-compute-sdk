/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const assert = require('assert');
const sinon = require('sinon');
const AssetComputeWorker = require('../lib/worker');

function build(options) {
    const worker = Object.create(AssetComputeWorker.prototype);
    worker.options = options;
    worker.params = { requestId: "req" };
    worker.renditionErrors = [];
    worker.renditionOutcomes = [];
    worker.metrics = { add: sinon.stub(), sendMetrics: sinon.stub().resolves() };
    worker.events = { sendEvent: sinon.stub().resolves() };
    const t = { start() {}, stop() {}, currentDuration: () => 0, totalDuration: () => 0, toString: () => '0' };
    worker.timers = { actionDuration: t, download: t, processingCallback: t, postProcessing: t, upload: t };
    worker.actionName = "test";
    worker.sendMetrics = sinon.stub().resolves();
    worker.sendMetricsForRendition = sinon.stub().resolves();
    return worker;
}

const mkRendition = index => ({ index, instructionsForEvent: () => ({ index }), size: () => 1 });

const proxyquire = require('proxyquire');
const pipeline = require('@adobe/asset-compute-pipeline');

// worker whose action timeout fires immediately
const TimeoutWorker = proxyquire('../lib/worker', {
    '@adobe/asset-compute-pipeline': {
        ...pipeline,
        Utils: { ...pipeline.Utils, timeUntilActivationTimeout: () => 15000 }
    }
});

// runs the action timeout handler with fake timers, returns the order of hook/exit calls
async function runTimeout(worker, advanceMs = 0) {
    const order = [];
    const clock = sinon.useFakeTimers();
    const exitStub = sinon.stub(process, 'exit').callsFake(() => order.push("exit"));
    try {
        TimeoutWorker.prototype.sendEventsBeforeActionTimeout.call(worker);
        await clock.tickAsync(advanceMs);
    } finally {
        exitStub.restore();
        clock.restore();
    }
    return order;
}

describe("delegateFailureEvents", () => {
    it("sends rendition_failed by default", async () => {
        const w = build({});
        await w.renditionFailure(mkRendition(0), new Error("boom"), true);
        assert.strictEqual(w.events.sendEvent.callCount, 1);
        assert.strictEqual(w.getResult().renditionOutcomes, undefined);
    });

    it("sends nothing and records outcomes when enabled", async () => {
        const w = build({ delegateFailureEvents: true });
        await w.renditionFailure(mkRendition(0), new Error("boom"), true);
        assert.strictEqual(w.events.sendEvent.callCount, 0);
        const outcomes = w.getResult().renditionOutcomes;
        assert.deepStrictEqual(outcomes.map(o => [o.index, o.status, o.message]), [[0, "failed", "boom"]]);
        assert.ok(outcomes[0].errorType);
    });

    it("is ignored for custom workers", async () => {
        const w = build({ delegateFailureEvents: true });
        w.params.customWorker = true;
        await w.renditionFailure(mkRendition(0), new Error("boom"), true);
        assert.strictEqual(w.events.sendEvent.callCount, 1);
        assert.strictEqual(w.getResult().renditionOutcomes, undefined);
    });

    it("records success outcomes and lets a later result replace an earlier one", async () => {
        const w = build({ delegateFailureEvents: true });
        w.recordOutcome(0, "failed", new Error("first"));
        w.recordOutcome(0, "success");
        w.recordOutcome(1, "success");
        assert.deepStrictEqual(w.getResult().renditionOutcomes, [
            { index: 0, status: "success" },
            { index: 1, status: "success" }
        ]);
    });

    it("records unfinished renditions as failed on cleanup without events", async () => {
        const w = build({ delegateFailureEvents: true });
        w.renditions = [mkRendition(0), mkRendition(1)];
        await w.cleanup();
        assert.strictEqual(w.events.sendEvent.callCount, 0);
        assert.deepStrictEqual(w.renditionOutcomes.map(o => o.status), ["failed", "failed"]);
    });

    describe("on action timeout", () => {
        it("sends rendition_failed events and exits when not delegating", async () => {
            const w = build({});
            w.renditions = [mkRendition(0), mkRendition(1)];
            const order = await runTimeout(w);
            assert.deepStrictEqual(order, ["exit"]);
            assert.strictEqual(w.events.sendEvent.callCount, 2);
        });

        it("awaits onBeforeTimeout with outcomes before process.exit and sends no events", async () => {
            let hookErr;
            const order = [];
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async (err) => {
                    await new Promise(r => setTimeout(r, 20));
                    hookErr = err;
                    order.push("hook");
                }
            });
            w.renditions = [mkRendition(0), mkRendition(1)];
            w.renditions[0].eventSent = true;
            w.recordOutcome(0, "success");
            order.push(...await runTimeout(w, 100));
            assert.deepStrictEqual(order, ["hook", "exit"]);
            assert.strictEqual(w.events.sendEvent.callCount, 0);
            assert.strictEqual(hookErr.requestId, "req");
            assert.deepStrictEqual(hookErr.renditionOutcomes.map(o => [o.index, o.status]), [[0, "success"], [1, "failed"]]);
            assert.match(hookErr.message, /timed out/);
        });

        it("records outcomes from params when timing out before prepare()", async () => {
            let outcomes;
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async (err) => { outcomes = err.renditionOutcomes; }
            });
            w.params.renditions = [{ fmt: "png", target: "https://secret" }, { fmt: "jpg" }];
            await runTimeout(w);
            assert.strictEqual(w.events.sendEvent.callCount, 0);
            assert.deepStrictEqual(outcomes.map(o => [o.index, o.status]), [[0, "failed"], [1, "failed"]]);
        });

        it("still exits if onBeforeTimeout throws", async () => {
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async () => { throw new Error("hook failed"); }
            });
            w.renditions = [mkRendition(0)];
            assert.deepStrictEqual(await runTimeout(w), ["exit"]);
        });

        it("caps a hanging onBeforeTimeout so the process still exits", async () => {
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: () => new Promise(() => {})
            });
            w.renditions = [mkRendition(0)];
            const order = [];
            const clock = sinon.useFakeTimers();
            const exitStub = sinon.stub(process, 'exit').callsFake(() => order.push("exit"));
            try {
                TimeoutWorker.prototype.sendEventsBeforeActionTimeout.call(w);
                await clock.tickAsync(9000);
                assert.deepStrictEqual(order, []);
                await clock.tickAsync(1500);
                assert.deepStrictEqual(order, ["exit"]);
            } finally {
                exitStub.restore();
                clock.restore();
            }
        });
    });
});
