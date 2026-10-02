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
const proxyquire = require('proxyquire');

function createApi(factory, options) {
    const compute = sinon.stub().resolves({ pipeline: true });
    const Pipeline = sinon.stub().callsFake(function () { this.compute = compute; });
    const Shell = sinon.stub();
    Shell.validate = sinon.stub();
    const api = proxyquire('../lib/api', {
        './webaction': fn => fn,
        './worker-pipeline': { AssetComputeWorkerPipeline: Pipeline },
        './shell/shellscript': Shell
    });
    const main = factory === "shellScriptWorker"
        ? api[factory]("worker.sh", { supportsPipeline: true, ...options })
        : api[factory](async () => {}, options);
    return { main, Pipeline, compute };
}

describe("pipeline failure delegation guard", () => {
    for (const factory of ["worker", "batchWorker", "shellScriptWorker"]) {
        it(`${factory}: rejects delegation before constructing or running a pipeline`, async () => {
            const { main, Pipeline, compute } = createApi(factory, { delegateFailureEvents: true });
            // A pipeline rendition anywhere in the list selects the pipeline route.
            const params = { renditions: [{ fmt: "png" }, { fmt: "jpg", pipeline: true }] };
            await assert.rejects(async () => main(params), err => {
                assert.match(err.message, /delegateFailureEvents is not supported for pipeline renditions/);
                assert.strictEqual(err.noRetry, true);
                return true;
            });
            assert.strictEqual(Pipeline.callCount, 0);
            assert.strictEqual(compute.callCount, 0);
        });

        it(`${factory}: preserves legacy pipeline execution with delegation disabled`, async () => {
            const { main, Pipeline, compute } = createApi(factory, { delegateFailureEvents: false });
            assert.deepStrictEqual(await main({ renditions: [{ pipeline: true }] }), { pipeline: true });
            assert.strictEqual(Pipeline.callCount, 1);
            assert.strictEqual(compute.callCount, 1);
        });

        it(`${factory}: custom workers continue to ignore the delegation option`, async () => {
            const { main, Pipeline } = createApi(factory, { delegateFailureEvents: true });
            assert.deepStrictEqual(await main({ customWorker: true, renditions: [{ pipeline: true }] }), { pipeline: true });
            assert.strictEqual(Pipeline.callCount, 1);
        });
    }
});
