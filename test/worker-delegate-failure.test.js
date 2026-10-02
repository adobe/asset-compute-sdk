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

    it("preserves the original preparation error and outcomes when error telemetry rejects", async () => {
        const w = build({ delegateFailureEvents: true });
        const original = new Error("download failed");
        w.params.renditions = [{ fmt: "png" }, { fmt: "jpg" }];
        w.prepare = sinon.stub().rejects(original);
        w.cleanup = sinon.stub().resolves();
        w.metrics.handleError = sinon.stub().rejects(new Error("telemetry failed"));
        const err = await w.run(async () => {}).then(() => assert.fail("should throw"), e => e);
        assert.strictEqual(err, original);
        assert.strictEqual(err.requestId, "req");
        assert.strictEqual(err.invocationFailed, true);
        assert.deepStrictEqual(err.renditionOutcomes.map(o => o.message), ["download failed", "download failed"]);
    });

    it("cleanup does not replace a source-download failure with Unknown error", async () => {
        const w = build({ delegateFailureEvents: true });
        w.params.renditions = [{ fmt: "png" }, { fmt: "jpg" }];
        w.renditions = [mkRendition(0), mkRendition(1)];
        w.prepare = sinon.stub().rejects(new Error("download failed"));
        w.metrics.handleError = sinon.stub().resolves();
        const err = await w.run(async () => {}).then(() => assert.fail("should throw"), e => e);
        assert.strictEqual(err.message, "download failed");
        assert.deepStrictEqual(err.renditionOutcomes.map(o => o.message), ["download failed", "download failed"]);
        assert.strictEqual(w.events.sendEvent.callCount, 0);
    });

    describe("on action timeout", () => {

        for (const timeoutDuringCleanup of [false, true]) {
            it(`normal completion waits for timeout reporting (${timeoutDuringCleanup ? "during cleanup" : "during processing"})`, async () => {
                let finishWork;
                let finishHook;
                let hookResult;
                let result;
                const w = build({
                    delegateFailureEvents: true,
                    onBeforeTimeout: err => {
                        hookResult = err;
                        return new Promise(resolve => { finishHook = resolve; });
                    }
                });
                w.params.renditions = [{ fmt: "png" }];
                w.renditions = [mkRendition(0)];
                w.prepare = sinon.stub().resolves();
                const work = () => new Promise(resolve => { finishWork = resolve; });
                w.cleanup = timeoutDuringCleanup ? work : sinon.stub().resolves();
                const clock = sinon.useFakeTimers();
                try {
                    const run = w.run(timeoutDuringCleanup ? async () => {} : work)
                        .then(r => { result = r; }, e => { result = e; });
                    await clock.tickAsync(0);
                    const finalization = w.finalizeOnTimeout();
                    await clock.tickAsync(0);
                    finishWork();
                    await clock.tickAsync(0);
                    assert.strictEqual(result, undefined, "normal return must not overtake the hook");
                    finishHook();
                    await finalization;
                    await run;
                    assert.strictEqual(result, hookResult);
                    assert.strictEqual(result.invocationFailed, true);
                    assert.deepStrictEqual(result.renditionOutcomes.map(o => o.status), ["failed"]);
                } finally {
                    clock.restore();
                }
            });
        }

        it("shares one terminal snapshot and hook call even when finalization is requested twice", async () => {
            let snapshot;
            const hook = sinon.spy(err => { snapshot = err; });
            const w = build({ delegateFailureEvents: true, onBeforeTimeout: hook });
            w.renditions = [mkRendition(0)];
            const first = w.finalizeOnTimeout();
            assert.strictEqual(w.finalizeOnTimeout(), first);
            await first;
            assert.strictEqual(hook.callCount, 1);
            assert.strictEqual(snapshot, w.timeoutResult);
            // Late success remains an accepted delivery trade-off, but cannot
            // change the saved terminal result returned by run().
            w.recordOutcome(0, "success");
            assert.deepStrictEqual(snapshot.renditionOutcomes.map(o => o.status), ["failed"]);
        });
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

        it("hands onBeforeTimeout a snapshot that later results cannot change", async () => {
            let outcomes;
            const w = build({
                delegateFailureEvents: true,
                onBeforeTimeout: async (err) => { outcomes = err.renditionOutcomes; }
            });
            w.renditions = [mkRendition(0)];
            await runTimeout(w);
            w.recordOutcome(0, "success");
            assert.deepStrictEqual(outcomes.map(o => [o.index, o.status]), [[0, "failed"]]);
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
