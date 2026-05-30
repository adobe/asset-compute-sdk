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
const proxyquire = require('proxyquire').noCallThru();

// Stub the image post-processing module so the SDK's postProcess() method
// can be exercised in isolation (no imagemagick, no real Rendition class).
const imagePostProcessStub = sinon.stub();
const fakeImagePostProcessModule = {
    prepareImagePostProcess: sinon.stub().resolves(null),
    needsImagePostProcess: sinon.stub().resolves(false),
    imagePostProcess: imagePostProcessStub
};

// Stub the Rendition class from @adobe/asset-compute-pipeline so we don't
// need to construct a real Rendition (which requires storage config, etc).
class FakeRendition {
    constructor(originalInstructions, dir, index) {
        this.originalInstructions = originalInstructions;
        this.directory = dir;
        this.index = index;
        this.name = `rendition${index}.${originalInstructions.fmt || 'png'}`;
        this.path = `${dir}/${this.name}`;
    }
    exists() { return true; }
    static redactInstructions(i) { return i; }
    static forEach(arr) { return arr; }
}
const fakePipelineModule = {
    Utils: {
        setConsoleLogPrefix: () => {},
        durationSec: () => 0
    },
    Rendition: FakeRendition,
    Prepare: function () { this.createDirectories = sinon.stub().resolves({}); },
    Storage: { getSource: sinon.stub().resolves({}), putRendition: sinon.stub().resolves() },
    Timer: function () { this.start = () => this; this.stop = () => this; this.toString = () => '0'; this.currentDuration = () => 0; this.totalDuration = () => 0; }
};

const AssetComputeWorker = proxyquire('../lib/worker', {
    './postprocessing/image': fakeImagePostProcessModule,
    '@adobe/asset-compute-pipeline': fakePipelineModule
});

// Bypass the AssetComputeWorker constructor (which depends on action runtime
// internals) and only wire up what postProcess() actually touches. We're
// testing the finalizer loop, not constructor wiring.
function buildTestWorker() {
    const worker = Object.create(AssetComputeWorker.prototype);
    worker.directories = { postprocessing: '/tmp/post' };
    worker.metrics = { add: sinon.stub() };
    const timerStub = { start: () => {}, stop: () => {}, currentDuration: () => 0, totalDuration: () => 0, toString: () => '0' };
    worker.timers = { actionDuration: timerStub, postProcessing: timerStub };
    worker.renditions = [];
    worker.source = { path: '/tmp/source.png', extension: 'png' };
    return worker;
}

function makeRendition({ withFinalizers = [], postProcessFlag = false } = {}) {
    const r = new FakeRendition({ fmt: "png" }, '/tmp/out', 0);
    r.postProcess = postProcessFlag;
    if (withFinalizers.length) {
        r._postProcessFinalizers = withFinalizers;
    }
    return r;
}

describe("worker.postProcess() — onAfterRendition finalizers", () => {

    afterEach(() => {
        sinon.resetHistory();
        delete process.env.WORKER_TEST_MODE;
    });

    it("does not change behavior when no finalizers are registered (skip postProcess path)", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const rendition = makeRendition();
        const result = await worker.postProcess(rendition);

        assert.strictEqual(result, rendition, "returns the same rendition when no finalizers registered");
        assert.ok(worker.metrics.add.calledWith({ imagePostProcess: false }));
        assert.strictEqual(imagePostProcessStub.callCount, 0, "imagemagick path must not be called");
    });

    it("runs a single finalizer when postProcess is skipped — against the original rendition", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const calls = [];
        const finalizer = async (r) => { calls.push(r); };
        const rendition = makeRendition({ withFinalizers: [finalizer] });

        const result = await worker.postProcess(rendition);

        assert.strictEqual(calls.length, 1, "finalizer should fire exactly once");
        assert.strictEqual(calls[0], rendition, "finalizer receives the original rendition (no swap happened)");
        assert.strictEqual(result, rendition);
    });

    it("runs a finalizer when postProcess ran — against the NEW (post-processed) rendition", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(true);
        imagePostProcessStub.resolves();

        const calls = [];
        const finalizer = async (r) => { calls.push(r); };
        const rendition = makeRendition({ withFinalizers: [finalizer], postProcessFlag: true });
        worker.renditions[rendition.index] = rendition;

        const result = await worker.postProcess(rendition);

        assert.strictEqual(calls.length, 1, "finalizer should fire");
        assert.notStrictEqual(calls[0], rendition,
            "finalizer receives the swapped post-processed rendition, NOT the original intermediate");
        assert.strictEqual(calls[0], result, "finalizer receives the same rendition the SDK returns/uploads");
        assert.strictEqual(calls[0].directory, '/tmp/post', "the post-processed rendition lives in directories.postprocessing");
        assert.ok(worker.metrics.add.calledWith({ imagePostProcess: true }));
    });

    it("runs multiple finalizers in order, all receive the same final rendition", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const seen = [];
        const f1 = async (r) => { seen.push(['f1', r]); };
        const f2 = async (r) => { seen.push(['f2', r]); };
        const f3 = async (r) => { seen.push(['f3', r]); };
        const rendition = makeRendition({ withFinalizers: [f1, f2, f3] });

        await worker.postProcess(rendition);

        assert.deepStrictEqual(seen.map(x => x[0]), ['f1', 'f2', 'f3']);
        assert.ok(seen.every(([, r]) => r === rendition));
    });

    it("a finalizer that throws does NOT break upload and does NOT prevent subsequent finalizers", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const after = [];
        const throwing = async () => { throw new Error("simulated c2pa embed failure"); };
        const subsequent = async (r) => { after.push(r); };
        const rendition = makeRendition({ withFinalizers: [throwing, subsequent] });

        // The whole point: postProcess must resolve with the rendition,
        // not propagate the finalizer's error to the caller.
        const result = await worker.postProcess(rendition);

        assert.strictEqual(result, rendition, "postProcess returns rendition normally despite finalizer throw");
        assert.strictEqual(after.length, 1, "subsequent finalizer still ran after a throwing one");
        assert.strictEqual(after[0], rendition);
    });

    it("a finalizer that rejects (async) is also swallowed", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const rendition = makeRendition({
            withFinalizers: [() => Promise.reject(new Error("async reject"))]
        });

        const result = await worker.postProcess(rendition);
        assert.strictEqual(result, rendition);
    });

    it("finalizers from the ORIGINAL rendition propagate when a swap to post-processed rendition happens", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(true);
        imagePostProcessStub.resolves();

        let received;
        const finalizer = async (r) => { received = r; };
        const original = makeRendition({ withFinalizers: [finalizer], postProcessFlag: true });
        worker.renditions[original.index] = original;

        await worker.postProcess(original);

        // Critical invariant: even though the rendition reference was reassigned
        // to newRendition inside postProcess(), the finalizer registered on the
        // original still ran (against the new rendition).
        assert.ok(received, "finalizer ran despite the swap");
        assert.notStrictEqual(received, original, "received the post-processed rendition, not the original");
    });

    it("works correctly when _postProcessFinalizers is not an array (defensive)", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);

        const rendition = makeRendition();
        rendition._postProcessFinalizers = "not an array";  // garbage input

        // Should not throw; treats non-array as "no finalizers"
        const result = await worker.postProcess(rendition);
        assert.strictEqual(result, rendition);
    });

    it("does NOT run finalizers when imagePostProcess() throws (no final rendition to embed into)", async () => {
        // G-11: if SDK post-processing itself fails, there is no final rendition
        // on disk for the finalizer to operate on. The catch branch must take
        // over and finalizers must be skipped — otherwise a c2pa embed (or any
        // other finalizer) would run against an absent/garbage file.
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(true);
        imagePostProcessStub.rejects(new Error("simulated imagemagick failure"));
        worker.renditionFailure = sinon.stub().resolves();

        const calls = [];
        const finalizer = async (r) => { calls.push(r); };
        const rendition = makeRendition({ withFinalizers: [finalizer], postProcessFlag: true });
        worker.renditions[rendition.index] = rendition;

        const result = await worker.postProcess(rendition);

        assert.strictEqual(result, undefined, "postProcess returns undefined to signal failure");
        assert.strictEqual(calls.length, 0, "finalizer MUST NOT run when imagePostProcess threw");
        assert.ok(worker.renditionFailure.calledOnce, "renditionFailure should be invoked on post-process failure");
    });
});

describe("worker.batchProcessRenditions() — onAfterRendition finalizers", () => {

    afterEach(() => {
        sinon.resetHistory();
        delete process.env.WORKER_TEST_MODE;
    });

    // G-10: lock in that finalizers also run on the batchWorker/computeAllAtOnce
    // code path. batchProcessRenditions iterates this.renditions and calls
    // this.postProcess(rendition) on each — same primitive used by the
    // single-rendition path. A future refactor that bypassed postProcess in
    // the batch path would silently drop finalizers (e.g. c2pa propagation)
    // for every computeAllAtOnce worker.
    it("invokes finalizers for every rendition on the batchProcessRenditions path", async () => {
        const worker = buildTestWorker();
        sinon.stub(worker, 'shouldPostProcess').resolves(false);
        worker.preparePostProcess = sinon.stub().resolves();
        worker.upload = sinon.stub().resolves();
        worker.renditionSuccess = sinon.stub().resolves();
        worker.renditionFailure = sinon.stub().resolves();
        worker.params = {};
        worker.directories = { postprocessing: '/tmp/post', out: '/tmp/out' };
        worker.options = { disableRenditionUpload: false };
        const timerStub = { start: () => {}, stop: () => {}, currentDuration: () => 0, totalDuration: () => 0, toString: () => '0' };
        worker.timers.processingCallback = timerStub;

        const calls = [];
        const finalizer = async (r) => { calls.push(r); };

        const r0 = makeRendition({ withFinalizers: [finalizer] });
        const r1 = new FakeRendition({ fmt: "png" }, '/tmp/out', 1);
        r1.postProcess = false;
        r1._postProcessFinalizers = [finalizer];
        worker.renditions = [r0, r1];

        // user batch callback — produces nothing here; we only care about
        // postProcess being invoked after the callback resolves
        const renditionsCallback = sinon.stub().resolves();

        await worker.batchProcessRenditions(renditionsCallback);

        assert.ok(renditionsCallback.calledOnce, "user batch callback ran");
        assert.strictEqual(calls.length, 2, "finalizer should fire once per rendition in the batch");
        assert.strictEqual(calls[0], r0);
        assert.strictEqual(calls[1], r1);
        assert.strictEqual(worker.upload.callCount, 2, "both renditions uploaded after their finalizers ran");
    });
});
