/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
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

const rewire = require("rewire"); // for testing of non-exported functions
const rewiredShellLib = rewire('../../lib/shell/shellscript');
const shellLib = rewire('../../lib/shell/shellscript');
const assert = require('assert');
const { execSync } = require('child_process');

const path = require('path');

describe("shellscript helpers", () => {
    const testSuccessWorkerPath = path.resolve(__dirname, "../../test/shell/success-worker.sh");

    it("verifies shellscript exist", () => {
        const existenceFunction = rewiredShellLib.__get__("verifyShellscriptExistence");
        const result = existenceFunction("../../test/shell/success-worker.sh", null, null);

        assert.equal(result.existence, true);
        assert.equal(result.path, testSuccessWorkerPath);
    });

    it("verifies shellscript exist (error case)", () => {
        const existenceFunction = rewiredShellLib.__get__("verifyShellscriptExistence");
        const result = existenceFunction("../../test/shell/i-do-not-exist.sh", {ingestionId: -42}, {name: "none"});

        assert.equal(result.existence, false);
    });

    it("verifies shellscript can be run", () => {
        const ensureExecutable = rewiredShellLib.__get__("ensureExecutable");
        const makeRunnableResult = ensureExecutable(testSuccessWorkerPath, 0);
        assert.equal(makeRunnableResult.error, false);
    });

    it("sets up run environment where rendition is not an object", () => {
        const setupRunEnvironment = rewiredShellLib.__get__("setupRunEnvironment");

        const outdir = path.join(__dirname, "../../test/files");
        const infile = path.join(__dirname, "../../test/files/file.png");
        const errorFile = path.join(__dirname, "../../test/files/test-txt.txt");
        const rendition = {};
        rendition.name = 'file.png';

        const resultEnv = setupRunEnvironment(rendition, outdir, infile, errorFile);
        assert.equal(resultEnv.file, infile);
        assert.equal(resultEnv.rendition, path.join(outdir, "file.png"));
        assert.equal(resultEnv.errorfile, errorFile);
        assert.equal(resultEnv.rendition_name, "file.png");
    });

    it("sets up run environment where rendition is an object", () => {
        const setupRunEnvironment = rewiredShellLib.__get__("setupRunEnvironment");

        const outdir = path.join(__dirname, "../../test/files");
        const infile = path.join(__dirname, "../../test/files/file.png");
        const errorFile = path.join(__dirname, "../../test/files/test-txt.txt");
        const rendition = {};
        rendition.name = 'a-rendition';
        rendition.first = {};
        rendition.second = {};
        rendition.first.name = 'file.png';
        rendition.second.name = 'file.png';

        const resultEnv = setupRunEnvironment(rendition, outdir, infile, errorFile);
        assert.equal(resultEnv.file, infile);
        assert.equal(resultEnv.rendition, path.join(outdir, "a-rendition"));
        assert.equal(resultEnv.errorfile, errorFile);
        assert.equal(resultEnv.rendition_name, "a-rendition");
        assert.equal(resultEnv.rendition_first_name, "file.png");
        assert.equal(resultEnv.rendition_second_name, "file.png");
    });

    it("sets up run environment and escapes ANSI string parts", () => {
        const setupRunEnvironment = rewiredShellLib.__get__("setupRunEnvironment");

        const outdir = path.join(__dirname, "../../test/files");
        const infile = path.join(__dirname, "../../test/files/file.png");
        const errorFile = path.join(__dirname, "../../test/files/test-txt.txt");
        const rendition = {};

        rendition.name = '\u001B[4mUnicorn\u001B[0m';
        let resultEnv = setupRunEnvironment(rendition, outdir, infile, errorFile);
        assert.equal(resultEnv.file, infile);
        assert.equal(resultEnv.rendition, path.join(outdir, "Unicorn"));
        assert.equal(resultEnv.errorfile, errorFile);
        assert.equal(resultEnv.rendition_name, "Unicorn");

        rendition.name = '\u001B[4mUnicorn.jpg\u001B[0m';
        resultEnv = setupRunEnvironment(rendition, outdir, infile, errorFile);
        assert.equal(resultEnv.file, infile);
        assert.equal(resultEnv.rendition, path.join(outdir, "Unicorn.jpg"));
        assert.equal(resultEnv.errorfile, errorFile);
        assert.equal(resultEnv.rendition_name, "Unicorn.jpg");
    });

    it("escapes a command", () => {
        const escapeCommand = rewiredShellLib.__get__("buildCommand");

        const result = escapeCommand("$USER");
        console.log(result);
        assert.equal(result, "BASH_XTRACEFD=1 /usr/bin/env bash -x '$USER'");
        // the single quote is part of the escaped string
    });

    it("runs a shell escaped script", () => {
        const escapeCommand = rewiredShellLib.__get__("buildCommand");

        const options = {
            stdio: [0,1,2]
        };

        const result = escapeCommand(testSuccessWorkerPath);
        const res = execSync(result, options);
        assert.equal(res, null); // means no execution error
    });

    // TODO
    /*
    it("handles execution errors (executor)", () => {
        assert.fail();
    });

    it("handles when there is no execution errors (executor)", () => {
        assert.fail();
    });//*/
});

describe("shellscript runs", () => {
    it("runs a shellscript", async () => {
        const renditioner = rewire('../../library.js');
        const foreachRenderer = renditioner.__get__("forEachRendition");

        try{
            await shellLib.shellScript({"ingestionId" : -42, "source": "https://google.com"}, 
                                        foreachRenderer, 
                                        "../../test/shell/success-worker.sh");
            assert.fail("Should not have been able to generate renditions")
        } catch(err){
            // should not be able to do any rendering
            assert.equal(err.name, "TypeError");
        }
    });

    // TODO
    /*it("handles error when shellscript is not found", () => {
        assert.fail();
    });

    it("handles error when execution fails", () => {
        assert.fail();
    });//*/
});

