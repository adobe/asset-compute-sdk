/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2019 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { shellScriptWorker } = require('../lib/api');
const ShellScriptWorker = require("../lib/shell/shellscript");
const { ClientError } = require('@nui/asset-compute-commons');

const testUtil = require('./testutil');
const assert = require('assert');
const mockFs = require('mock-fs');
const fs = require('fs');
const nock = require('nock');
const path = require("path");

const TEST_DIR = "build/tests/shellscript";

function createScript(file, data) {
    fs.writeFileSync(file, data);
}

function mockSource(filename="source.jpg") {
    return {
        filename,
        directory: path.resolve("out"),
        path: path.resolve("out", filename)
    };
}

function mockRendition(filename="rendition0.png") {
    return {
        id: () => 0,
        name: filename,
        directory: path.resolve("out"),
        path: path.resolve("out", filename)
    };
}

describe("api.js (shell)", () => {

    let previousWorkingDir;

    beforeEach(() => {
        testUtil.beforeEach();

        // we need to run actual bash as child process against scripts & source files
        // on the real filesystem, hence we must skip mock fs for these tests
        mockFs.restore();

        // operate in a safe subdirectory
        fs.mkdirSync(TEST_DIR, {recursive: true});
        previousWorkingDir = process.cwd();
        process.chdir(TEST_DIR);

        // might want to replace this with nock()ing
        process.env.NUI_UNIT_TEST_OUT = TEST_DIR + "/out";
    });

    afterEach( () => {
        process.chdir(previousWorkingDir);
        try {
            fs.rmdirSync(TEST_DIR, {recursive: true});
        } catch (ignore) {}

        testUtil.afterEach();

        delete process.env.NUI_UNIT_TEST_OUT;
    });

    describe("shellScriptWorker()", () => {

        it("should run a shell script", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker();

            await main(testUtil.simpleParams());
            assert(nock.isDone());
        });

        it("should run a shell script with custom name", async () => {
            createScript("my-worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker("my-worker.sh");

            await main(testUtil.simpleParams());
            assert(nock.isDone());
        });

        it("should run a shell script with multiple renditions", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker();

            await main(testUtil.paramsWithMultipleRenditions());
            assert(nock.isDone());
        });

        it("should catch a failing shell script", async () => {
            createScript("worker.sh", `exit 42`);
            const main = shellScriptWorker();

            try {
                await main(testUtil.simpleParams());
                // TODO: check that no rendition was generated?
            } catch (err) {
                console.log(err);
                assert.fail("should not pass a failure through");
            }
        });

        it("should throw if shell script is missing", async () => {
            // ensure there is no worker.sh
            try {
                fs.unlinkSync("worker.sh");
            } catch (ignore) {
            }
            assert.throws(() => shellScriptWorker(), /Shell script 'worker.sh' not found$/);
        });

        it("should automatically set execution permissions on shell script", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            fs.chmodSync("worker.sh", "000");

            const main = shellScriptWorker();

            await main(testUtil.simpleParams());
            assert(nock.isDone());
        });

        it("should handle error.json - GenericError if no type given", async () => {
            createScript("worker.sh", `
                echo '{ "message": "failed" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "GenericError",
                    message: "failed",
                    location: "test_action_shellScript"
                }
            );
        });

        it("should handle error.json - RenditionFormatUnsupported instanceof ClientError", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "RenditionFormatUnsupported", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()),
                // check that instanceof works
                err => err instanceof ClientError
            );
        });

        it("should handle error.json - RenditionFormatUnsupported", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "RenditionFormatUnsupported", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "RenditionFormatUnsupportedError",
                    message: "problem"
                }
            );
        });

        it("should handle error.json - RenditionTooLarge", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "RenditionTooLarge", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "RenditionTooLarge",
                    message: "problem"
                }
            );
        });

        it("should handle error.json - SourceCorrupt", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "SourceCorrupt", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "SourceCorruptError",
                    message: "problem"
                }
            );
        });

        it("should handle error.json - SourceFormatUnsupported", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "SourceFormatUnsupported", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "SourceFormatUnsupportedError",
                    message: "problem"
                }
            );
        });

        it("should handle error.json - SourceUnsupported", async () => {
            createScript("worker.sh", `
                echo '{ "reason": "SourceUnsupported", "message": "problem" }' > $errorfile
                exit 1
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "SourceUnsupportedError",
                    message: "problem"
                }
            );
        });

        it("should handle error.json - malformed json", async () => {
            createScript("worker.sh", `
                echo '{ "message": MALFORMED' > $errorfile
                exit 42
            `);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "GenericError",
                    message: /exit code 42/
                }
            );
        });

        it("should handle error.json - missing json", async () => {
            createScript("worker.sh", `exit 23`);

            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "GenericError",
                    message: /exit code 23/
                }
            );
        });

        // TODO: test env params
        // TODO: shell escaping, pass rendition.wid = "; cp library rendition.name"
        // TODO: move tests from test/shell/shelscript.test.js
    });
});
