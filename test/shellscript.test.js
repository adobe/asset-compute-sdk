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

'use strict';

const { shellScriptWorker } = require('../lib/api');
const ShellScriptWorker = require("../lib/shell/shellscript");
const { ClientError } = require('@nui/asset-compute-commons');

const testUtil = require('./testutil');
const assert = require('assert');
const mockFs = require('mock-fs');
const fs = require('fs');
const path = require("path");
const envfile = require("envfile");

const TEST_DIR = "build/tests/shellscript";

function createScript(file, data) {
    fs.writeFileSync(file, data);
}

function mockSource(filename="source.jpg") {
    return {
        filename,
        directory: path.resolve("in"),
        path: path.resolve("in", filename)
    };
}

function mockRendition(instructions={}, filename="rendition0.png") {
    return {
        id: () => 0,
        name: filename,
        directory: path.resolve("out"),
        path: path.resolve("out", filename),
        instructions: instructions,
        target: instructions.target
    };
}

function readEnv(file) {
    const env = envfile.parseFileSync(file);
    for (const [key, value] of Object.entries(env)) {
        env[key.toLowerCase()] = value;
    }
    return env;
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
    });

    afterEach( () => {
        process.chdir(previousWorkingDir);
        try {
            fs.rmdirSync(TEST_DIR, {recursive: true});
        } catch (ignore) {}

        testUtil.afterEach();
        delete process.env.DISABLE_ACTION_TIMEOUT
    });

    describe("shellScriptWorker()", () => {

        it("should run a shell script and handle resulting rendition", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker();

            await main(testUtil.simpleParams());
            testUtil.assertNockDone();
        });

        it("should run a shell script with custom name", async () => {
            createScript("my-worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker("my-worker.sh");

            await main(testUtil.simpleParams());
            testUtil.assertNockDone();
        });

        it("should run a shell script with multiple renditions", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker();

            await main(testUtil.paramsWithMultipleRenditions());
            testUtil.assertNockDone();
        });

        it("should catch a failing shell script", async () => {
            createScript("worker.sh", `exit 42`);
            const main = shellScriptWorker();

            try {
                await main(testUtil.simpleParams({noPut: true, noMetricsNock: true}));

            } catch (err) {
                console.log(err);
                assert.fail("should not pass a failure through");
            }
            testUtil.assertNockDone();
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
            testUtil.assertNockDone();
        });

        it("should handle error.json - but not throw error in shellScriptWorker()", async () => {
            createScript("worker.sh", `
                echo '{ "message": "failed" }' > $errorfile
                exit 1
            `);

            const main = shellScriptWorker();

            try {
                await main(testUtil.simpleParams({noPut: true, noMetricsNock:true}));

            } catch (err) {
                console.log(err);
                assert.fail("should not pass a failure through");
            }
            testUtil.assertNockDone();
        });

        it("should handle error.json - GenericError if no type given", async () => {
            createScript("worker.sh", `
                echo '{ "message": "failed" }' > $errorfile
                exit 1
            `);
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
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
            process.env.DISABLE_ACTION_TIMEOUT = true;
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams());

            await assert.rejects(
                scriptWorker.processWithScript(mockSource(), mockRendition()), {
                    name: "GenericError",
                    message: /exit code 23/
                }
            );
        });

        it("should prevent shell injection on script name", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);

            const params = testUtil.simpleParams();
            process.env.DISABLE_ACTION_TIMEOUT = true;
            // injection attack on script name
            try {
                const scriptWorker = new ShellScriptWorker(params, {script: "-c 'exit 66'"});
                await scriptWorker.processWithScript(mockSource(), mockRendition());
            } catch (err) {
                assert.notEqual(err.exitCode, 66, "shell injection on script name unexpectedly worked");
                assert.ok(!err.message.includes("exit code 66"), "shell injection on script name unexpectedly worked");
            }
        });

        it("should prevent shell injection on rendition instructions", async () => {
            createScript("worker.sh", `
                function process() {
                    echo $@
                }
                process --width $rendition_wid $source $rendition
            `);

            const params = testUtil.simpleParams({noSourceDownload: true, noPut: true});
            process.env.DISABLE_ACTION_TIMEOUT = true;
            // injection attack on argument (kind of...)
            params.renditions[0].wid = "; exit 66 #";

            const scriptWorker = new ShellScriptWorker(params);
            await scriptWorker.processWithScript(mockSource(), mockRendition());
        });

        it("should pass rendition instructions as environment variables to script", async () => {
            createScript("worker.sh", `
                env > envfile
                echo ${testUtil.RENDITION_CONTENT} > $rendition
            `);

            const rendition = {
                target: "https://example.com/MyRendition.png",
                wid: 100,
                fmt: "png",
                foobar: "correct",
                crop: {
                    x: 0,
                    y: 0,
                    w: 100,
                    h: 200
                }
            };
            process.env.DISABLE_ACTION_TIMEOUT = true;
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams({ rendition }));
            await scriptWorker.processWithScript(mockSource(), mockRendition(rendition));

            const env = readEnv("envfile");
            assert.equal(env.source, `${process.cwd()}/in/source.jpg`);
            assert.equal(env.file, env.source);
            assert.equal(env.errorfile, `${process.cwd()}/out/errors/error.json`);
            assert.equal(env.rendition, `${process.cwd()}/out/rendition0.png`);
            assert.equal(env.rendition_target, "https://example.com/MyRendition.png");
            assert.equal(env.rendition_wid, rendition.wid);
            assert.equal(env.rendition_fmt, rendition.fmt);
            assert.equal(env.rendition_foobar, rendition.foobar);
            assert.equal(env.rendition_crop_x, rendition.crop.x);
            assert.equal(env.rendition_crop_y, rendition.crop.y);
            assert.equal(env.rendition_crop_w, rendition.crop.w);
            assert.equal(env.rendition_crop_h, rendition.crop.h);
        });

        it("should strip ansi escape codes from instructions passed as environment variables to the script", async () => {
            createScript("worker.sh", `
                env > envfile
                echo ${testUtil.RENDITION_CONTENT} > $rendition
            `);

            const source = mockSource('\u001B[4msource.jpg\u001B[0m');
            const rendition = {
                target: '\u001B[4mUnicorn\u001B[0m',
                wid: '\u001B[4mUnicorn\u001B[0m',
                fmt: '\u001B[4mUnicorn\u001B[0m',
                foobar: '\u001B[4mUnicorn\u001B[0m',
                crop: {
                    x: '\u001B[4mUnicorn\u001B[0m'
                }
            };
            const rend = mockRendition(rendition, '\u001B[4mrendition0.png\u001B[0m');
            process.env.DISABLE_ACTION_TIMEOUT = true;
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams({ rendition }));
            await scriptWorker.processWithScript(source, rend);

            const env = readEnv("envfile");
            assert.equal(env.source, `${process.cwd()}/in/source.jpg`);
            assert.equal(env.file, env.source);
            assert.equal(env.errorfile, `${process.cwd()}/out/errors/error.json`);
            assert.equal(env.rendition, `${process.cwd()}/out/rendition0.png`);
            assert.equal(env.rendition_target, "Unicorn");
            assert.equal(env.rendition_wid, "Unicorn");
            assert.equal(env.rendition_fmt, "Unicorn");
            assert.equal(env.rendition_foobar, "Unicorn");
            assert.equal(env.rendition_crop_x, "Unicorn");
        });

        // TODO: get rid of NUI_UNIT_TEST_MODE, nock events
    });
});
