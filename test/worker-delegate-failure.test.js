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
    worker.pendingSuccessEvents = new Set();
    worker.metrics = { add: sinon.stub(), sendMetrics: sinon.stub().resolves() };
    worker.events = { sendEvent: sinon.stub().resolves() };
    const t = { start() {}, stop() {}, currentDuration: () => 0, totalDuration: () => 0, toString: () => '0' };
    worker.timers = { actionDuration: t, download: t, processingCallback: t, postProcessing: t, upload: t };
    worker.actionName = "test";
    worker.sendMetrics = sinon.stub().resolves();
    worker.sendMetricsForRendition = sinon.stub().resolves();
    return worker;
}

const mkRendition = index => ({
    index,
    instructionsForEvent: () => ({ index }),
    size: () => 1,
    metadata: async () => ({}),
    shouldEmbedInIOEvent: () => false
});

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
async function runTimeout(worker, advanceMs = 0, beforeTimeout) {
    const order = [];
    const clock = sinon.useFakeTimers();
    const exitStub = sinon.stub(process, 'exit').callsFake(() => order.push("exit"));
    try {
        if (beforeTimeout) {
            beforeTimeout();
        }
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

    it("reports every requested rendition as failed when the invocation fails before renditions exist", async () => {
        const w = build({ delegateFailureEvents: true });
        w.params.renditions = [{ fmt: "png" }, { fmt: "jpg" }];
        w.prepare = sinon.stub().rejects(new Error("mkdir failed"));
        w.cleanup = sinon.stub().resolves();
        w.metrics.handleError = sinon.stub().resolves();
        const err = await w.run(async () => {}).then(() => assert.fail("should throw"), e => e);
        assert.strictEqual(err.message, "mkdir failed");
        assert.strictEqual(err.invocationFailed, true);
        assert.deepStrictEqual(err.renditionOutcomes.map(o => [o.index, o.status, o.message]),
            [[0, "failed", "mkdir failed"], [1, "failed", "mkdir failed"]]);
    });

    it("marks successful invocations as not failed", async () => {
        const w = build({ delegateFailureEvents: true });
        assert.strictEqual(w.getResult().invocationFailed, false);
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

        it("still calls onBeforeTimeout and exits if timeout metrics hang", async () => {
            const hook = sinon.stub().resolves();
            const w = build({ delegateFailureEvents: true, onBeforeTimeout: hook });
            w.metrics.sendMetrics = sinon.stub().returns(new Promise(() => {}));
            w.renditions = [mkRendition(0)];
            assert.deepStrictEqual(await runTimeout(w, 10500), ["exit"]);
            assert.strictEqual(hook.callCount, 1);
        });

        it("still calls onBeforeTimeout and exits if timeout metrics fail", async () => {
            const hook = sinon.stub().resolves();
            const w = build({ delegateFailureEvents: true, onBeforeTimeout: hook });
            w.metrics.sendMetrics = sinon.stub().rejects(new Error("metrics down"));
            w.renditions = [mkRendition(0)];
            assert.deepStrictEqual(await runTimeout(w), ["exit"]);
            assert.strictEqual(hook.callCount, 1);
        });

        it("waits for an in-flight rendition_created event and reports it as success", async () => {
            let outcomes;
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async (err) => { outcomes = err.renditionOutcomes; }
            });
            w.renditions = [mkRendition(0), mkRendition(1)];
            w.events.sendEvent = () => new Promise(r => setTimeout(r, 500));
            const order = await runTimeout(w, 1000, () => w.renditionSuccess(w.renditions[0]));
            assert.deepStrictEqual(order, ["exit"]);
            assert.deepStrictEqual(outcomes.map(o => [o.index, o.status]), [[0, "success"], [1, "failed"]]);
        });

        it("hands onBeforeTimeout a snapshot that late results cannot change", async () => {
            let outcomes;
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async (err) => { outcomes = err.renditionOutcomes; }
            });
            w.renditions = [mkRendition(0)];
            // publication never completes within the wait, so the rendition times out
            let finishPublication;
            w.events.sendEvent = () => new Promise(r => { finishPublication = r; });
            const success = w.renditionSuccess(w.renditions[0]);
            await runTimeout(w, 5000);
            assert.deepStrictEqual(outcomes.map(o => [o.index, o.status]), [[0, "failed"]]);
            finishPublication();
            await success;
            assert.deepStrictEqual(outcomes.map(o => [o.index, o.status]), [[0, "failed"]]);
            assert.deepStrictEqual(w.renditionOutcomes.map(o => [o.index, o.status]), [[0, "failed"]]);
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
