/*
 * Copyright 2020 Adobe. All rights reserved.
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

'use strict';

const assert = require('assert');
const mockFs = require('mock-fs');

const { shellScriptWorker } = require('../lib/api');
const ShellScriptWorker = require("../lib/shell/shellscript");
const { ClientError } = require('@adobe/asset-compute-commons');

const testUtil = require('./testutil');
const fs = require('fs');
const path = require("path");
const envfile = require("envfile");
const { MetricsTestHelper } = require("@adobe/asset-compute-commons");
const { CMD_SIZE_LIMIT} = require('@adobe/asset-compute-pipeline').Sdk.Utils;

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
        process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;
    });

    afterEach( () => {
        process.chdir(previousWorkingDir);
        try {
            fs.rmdirSync(TEST_DIR, {recursive: true});
        } catch (ignore) { } /* eslint-disable-line no-unused-vars */

        testUtil.afterEach();
        delete process.env.DISABLE_ACTION_TIMEOUT_METRIC;
    });

    describe("shellScriptWorker()", () => {

        it("should run a shell script and handle resulting rendition", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition`);

            const main = shellScriptWorker();

            const result = await main(testUtil.simpleParams());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should run a shell script and handle resulting rendition and content type metadata (verbose)", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition && echo $typefile && echo "application/pdf; charset=binary" > "$typefile" && cat $typefile`);

            const main = shellScriptWorker();

            const result = await main(testUtil.simpleParams());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should run a shell script and handle gracefully malformed content type metadata", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition && echo "not-a-valid-content-type" > "$typefile"`);

            const main = shellScriptWorker();

            const result = await main(testUtil.simpleParams());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should run a shell script with custom name", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("my-worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker("my-worker.sh");

            const result = await main(testUtil.simpleParams());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should run a shell script with multiple renditions", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition`);
            const main = shellScriptWorker();

            const result = await main(testUtil.paramsWithMultipleRenditions());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertParamsWithMultipleRenditions(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should catch a failing shell script", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `exit 42`);
            const main = shellScriptWorker();

            try {
                const params = testUtil.simpleParams({noPut: true});

                const result = await main(params);

                // validate errors
                assert.ok(result.renditionErrors);
                assert.strictEqual(result.renditionErrors.length, 1);
                assert.strictEqual(result.renditionErrors[0].name, "GenericError");
                assert.strictEqual(result.renditionErrors[0].location, "test_action_shellScript");

            } catch (err) {
                console.log(err);
                assert.fail("should not pass a failure through");
            }

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                message: "`/usr/bin/env bash -x worker.sh` failed with exit code 42",
                location: "test_action_shellScript"
            },{
                eventType: "activation",
            }]);
            testUtil.assertNockDone();
        });

        it("should throw if shell script is missing", async () => {
            // ensure there is no worker.sh
            try {
                fs.unlinkSync("worker.sh");
            } catch (ignore) { /* eslint-disable-line no-unused-vars */
            }
            assert.throws(() => shellScriptWorker(), /Shell script 'worker.sh' not found$/);
        });

        it("should automatically set execution permissions on shell script", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `echo -n "${testUtil.RENDITION_CONTENT}" > $rendition`);
            fs.chmodSync("worker.sh", "000");

            const main = shellScriptWorker();

            const result = await main(testUtil.simpleParams());

            // validate no errors
            assert.ok(result.renditionErrors === undefined);

            await testUtil.assertSimpleParamsMetrics(receivedMetrics);
            testUtil.assertNockDone();
        });

        it("should handle error.json - but not throw error in shellScriptWorker()", async () => {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            createScript("worker.sh", `
                echo '{ "message": "failed" }' > $errorfile
                exit 1
            `);

            const main = shellScriptWorker();

            try {
                const params = testUtil.simpleParams({noPut: true});

                const result = await main(params);

                // validate errors
                assert.ok(result.renditionErrors);
                assert.strictEqual(result.renditionErrors.length, 1);
                assert.strictEqual(result.renditionErrors[0].name, "GenericError");
                assert.strictEqual(result.renditionErrors[0].location, "test_action_shellScript");
                assert.strictEqual(result.renditionErrors[0].message, "failed");

            } catch (err) {
                console.log(err);
                assert.fail("should not pass a failure through");
            }

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                eventType: "error",
                message: "failed",
                location: "test_action_shellScript"
            },{
                eventType: "activation",
            }]);
            testUtil.assertNockDone();
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

        it("should prevent shell injection on script name", async () => {
            createScript("worker.sh", `echo "${testUtil.RENDITION_CONTENT}" > $rendition`);

            const params = testUtil.simpleParams();
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
                process --width $rendition_width $source $rendition
            `);

            const params = testUtil.simpleParams({noSourceDownload: true, noPut: true});
            // injection attack on argument (kind of...)
            params.renditions[0].width = "; exit 66 #";

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
                width: 100,
                fmt: "png",
                foobar: "correct",
                crop: {
                    x: 0,
                    y: 0,
                    w: 100,
                    h: 200
                }
            };
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams({ rendition }));
            await scriptWorker.processWithScript(mockSource(), mockRendition(rendition));

            const env = readEnv("envfile");
            assert.strictEqual(env.source, `${process.cwd()}/in/source.jpg`);
            assert.strictEqual(env.file, env.source);
            assert.strictEqual(env.errorfile, `${process.cwd()}/out/errors/error.json`);
            assert.strictEqual(env.rendition, `${process.cwd()}/out/rendition0.png`);
            assert.strictEqual(env.typefile, `${process.cwd()}/out/errors/type.txt`);
            assert.strictEqual(env.rendition_target, "https://example.com/MyRendition.png");
            assert.strictEqual(env.rendition_width.toString(), rendition.width.toString());
            assert.strictEqual(env.rendition_fmt, rendition.fmt);
            assert.strictEqual(env.rendition_foobar, rendition.foobar);
            assert.strictEqual(env.rendition_crop_x.toString(), rendition.crop.x.toString());
            assert.strictEqual(env.rendition_crop_y.toString(), rendition.crop.y.toString());
            assert.strictEqual(env.rendition_crop_w.toString(), rendition.crop.w.toString());
            assert.strictEqual(env.rendition_crop_h.toString(), rendition.crop.h.toString());
        });

        it("should strip ansi escape codes from instructions passed as environment variables to the script", async () => {
            createScript("worker.sh", `
                env > envfile
                echo ${testUtil.RENDITION_CONTENT} > $rendition
            `);

            const source = mockSource('\u001B[4msource.jpg\u001B[0m');
            const rendition = {
                target: 'https://example.com/image.jpg',
                width: '\u001B[4mUnicorn\u001B[0m',
                fmt: '\u001B[4mUnicorn\u001B[0m',
                foobar: '\u001B[4mUnicorn\u001B[0m',
                crop: {
                    x: '\u001B[4mUnicorn\u001B[0m'
                }
            };
            const rend = mockRendition(rendition, '\u001B[4mrendition0.png\u001B[0m');
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams({ rendition }));
            await scriptWorker.processWithScript(source, rend);

            const env = readEnv("envfile");
            assert.strictEqual(env.source, `${process.cwd()}/in/source.jpg`);
            assert.strictEqual(env.file, env.source);
            assert.strictEqual(env.errorfile, `${process.cwd()}/out/errors/error.json`);
            assert.strictEqual(env.typefile, `${process.cwd()}/out/errors/type.txt`);
            assert.strictEqual(env.rendition, `${process.cwd()}/out/rendition0.png`);
            assert.strictEqual(env.rendition_target, "https://example.com/image.jpg");
            assert.strictEqual(env.rendition_width, "Unicorn");
            assert.strictEqual(env.rendition_fmt, "Unicorn");
            assert.strictEqual(env.rendition_foobar, "Unicorn");
            assert.strictEqual(env.rendition_crop_x, "Unicorn");
        });

        it("should pass variables larger than size limit as a file", async () => {
            createScript("worker.sh", `
                env > envfile
                echo ${testUtil.RENDITION_CONTENT} > $rendition
            `);

            // Build a random string that will exceed the command size limit.
            let longStringValue = "";
            // The random expression generates 4 characters each time from the set [0-9A-Za-z].  We start at 2 because the first two characters are always '1.'
            // 4 characters each time is more predictable since the string might not be long enough to get 8 each time.
            for (let i = 0; i < CMD_SIZE_LIMIT; i += 4) {
                longStringValue += (Math.random() + 1).toString(36).substring(2,6);
            }

            // This variable is below the size limit but only by a little bit.  It should not be written to a file
            // the other variable/values add up to over 750 characters already, so we need to chop off more than that to keep the argument from
            // exceeding the command size limit.  To accomodate for path variances, we round up to 850.
            const shorterStringValue = longStringValue.substring(0, CMD_SIZE_LIMIT - 850);

            const rendition = {
                target: "https://example.com/MyRendition.png",
                width: 100,
                fmt: "png",
                foobar: "correct",
                crop: {
                    x: 0,
                    y: 0,
                    w: 100,
                    h: 200
                },
                longParameter: longStringValue,
                shorterParameter: shorterStringValue
            };
            const scriptWorker = new ShellScriptWorker(testUtil.simpleParams({ rendition }));
            await scriptWorker.processWithScript(mockSource(), mockRendition(rendition));

            const env = readEnv("envfile");
            assert.equal(env.source, `${process.cwd()}/in/source.jpg`);
            assert.equal(env.file, env.source);
            assert.equal(env.errorfile, `${process.cwd()}/out/errors/error.json`);
            assert.equal(env.rendition, `${process.cwd()}/out/rendition0.png`);
            assert.equal(env.typefile, `${process.cwd()}/out/errors/type.txt`);
            assert.equal(env.rendition_target, "https://example.com/MyRendition.png");
            assert.equal(env.rendition_width, rendition.width);
            assert.equal(env.rendition_fmt, rendition.fmt);
            assert.equal(env.rendition_foobar, rendition.foobar);
            assert.equal(env.rendition_crop_x, rendition.crop.x);
            assert.equal(env.rendition_crop_y, rendition.crop.y);
            assert.equal(env.rendition_crop_w, rendition.crop.w);
            assert.equal(env.rendition_crop_h, rendition.crop.h);
            assert.equal(env.rendition_shorterParameter, shorterStringValue);
            assert.notEqual(env.rendition_longParameter, longStringValue);
            assert.notEqual(env.rendition_longParameter.length, undefined);

            // Shell script should know that parameter was stored in file via FILE_PARAMS
            assert.equal(env.FILE_PARAMS, "rendition_longParameter");

            // Temp file should contain the exact content of the long value
            const compareValue = fs.readFileSync(env.rendition_longParameter);
            assert.equal(compareValue, longStringValue);
        });
    });
});
