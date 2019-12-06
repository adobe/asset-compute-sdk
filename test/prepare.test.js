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

const fse = require('fs-extra');
const assert = require('assert');
const sinon = require('sinon');

const path = require('path');
const {createDirectories, cleanupDirectories} = require('../lib/prepare');

describe('prepare.js', () => {
    beforeEach(() => {
        // we actually want to test that fs behaves as expected
        //process.env.WORKER_TEST_MODE = null;
        process.env.__OW_ACTION_NAME = 'test_action_fs';
        process.env.__OW_ACTIVATION_ID = 'test_activation_id';
    });

    afterEach(() => {
        fse.removeSync(path.resolve("work"));
    });

    it('creates needed directories', async () => {
        const result = await createDirectories();

        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);

        assert.equal(result.base, baseDir);
        assert.equal(result.in, path.resolve(baseDir, "in"));
        assert.equal(result.out, path.resolve(baseDir, "out"));

        // check directories were created
        let existence = await fse.exists(baseDir);
        assert.ok(existence, "Base directory does not exist");

        existence = await fse.exists(path.resolve(baseDir, "in"));
        assert.ok(existence, "in directory does not exist");

        existence = await fse.exists(path.resolve(baseDir, "out"));
        assert.ok(existence, "out directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });

    it('does not throw if directories to create already exist', async () => {
        // make sure directories exist
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        await fse.mkdir(baseDir);
        await fse.mkdir(path.resolve(baseDir, "in"));
        await fse.mkdir(path.resolve(baseDir, "out"));
        let existence = await fse.exists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.exists(path.resolve(baseDir, "in"));
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.exists(path.resolve(baseDir, "out"));
        assert.ok(existence, "test setup failed - out directory does not exist");

        existence = false;
        const result = await createDirectories();
        assert.equal(result.base, baseDir);
        assert.equal(result.in, path.resolve(baseDir, "in"));
        assert.equal(result.out, path.resolve(baseDir, "out"));

        // check directories were created
        existence = await fse.exists(baseDir);
        assert.ok(existence, "Base directory does not exist");

        existence = await fse.exists(path.resolve(baseDir, "in"));
        assert.ok(existence, "in directory does not exist");

        existence = await fse.exists(path.resolve(baseDir, "out"));
        assert.ok(existence, "out directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });

    it('cleans up folders on the filesystem', async () => {
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        await fse.mkdir(baseDir);
        await fse.mkdir(inDir);
        await fse.mkdir(outDir);
        let existence = await fse.exists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.exists(inDir);
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.exists(outDir);
        assert.ok(existence, "test setup failed - out directory does not exist");

        const directories = {
            base: baseDir,
            in: inDir,
            out: outDir
        };
        const res = await cleanupDirectories(directories);
        assert.equal(res, true);

        existence = await fse.exists(baseDir);
        assert.ok(!existence, "base directory still exist");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "in directory still exist");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "out directory still exist");

        // work directory should not be deleted
        existence = await fse.exists(path.resolve("work"));
        assert.ok(existence, "work directory does not exist");

        // cleanup
        await fse.remove(baseDir);
    });

    it('does not throw if directories to remove do not exist', async () => {
        // make sure directories DO NOT exist
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        let existence = await fse.exists(baseDir);
        assert.ok(!existence, "test setup failed - base directory does exist");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "test setup failed - in directory does exist");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "test setup failed - out directory does exist");

        const directories = {
            base: baseDir,
            in: inDir,
            out: outDir
        };
        const res = await cleanupDirectories(directories);
        assert.equal(res, true);

        existence = await fse.exists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.exists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('does not throw if directories param is empty (no side-effects)', async () => {
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make sure directories DO NOT exist
        const directories = {};
        const res = await cleanupDirectories(directories);
        assert.equal(res, true);

        let existence = await fse.exists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.exists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('does not throw if directories param is null (no side-effects)', async () => {
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make sure directories DO NOT exist
        const directories = null;
        const res = await cleanupDirectories(directories);
        assert.equal(res, true);

        let existence = await fse.exists(baseDir);
        assert.ok(!existence, "base directory exists");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "in directory exists");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "out directory exists");

        // work directory should not be deleted
        existence = await fse.exists(path.resolve("work"));
        assert.ok(!existence, "work directory exists");
    });

    it('cleans up work directory if it already exists', async () => {
        await fse.mkdir(path.resolve("work"));
        const baseDir = path.resolve("work", process.env.__OW_ACTIVATION_ID);
        const inDir = path.resolve(baseDir, "in");
        const outDir = path.resolve(baseDir, "out");

        // make additional directories under work 
        const moreDir1 = path.resolve("work", "test-1");
        await fse.mkdir(moreDir1);
        let existence = await fse.exists(moreDir1);
        assert.ok(existence, "test setup failed");
        const moreDir2 = path.resolve("work", "test-2");
        await fse.mkdir(moreDir2);
        existence = await fse.exists(moreDir2);
        assert.ok(existence, "test setup failed");
        const moreDir3 = path.resolve("work", "test-3");
        await fse.mkdir(moreDir3);
        existence = await fse.exists(moreDir3);
        assert.ok(existence, "test setup failed");

        await fse.mkdir(baseDir);

        // make additional directories under baseDir
        const moreDirToMove = path.resolve(baseDir, "in1");
        await fse.mkdir(moreDirToMove);
        existence = await fse.exists(moreDirToMove);
        assert.ok(existence, "test setup failed");
        const moreDirToMove2 = path.resolve(baseDir, "in2");
        await fse.mkdir(moreDirToMove2);
        existence = await fse.exists(moreDirToMove2);
        assert.ok(existence, "test setup failed");

        await fse.mkdir(inDir);
        await fse.mkdir(outDir);
        existence = await fse.exists(baseDir);
        assert.ok(existence, "test setup failed - base directory does not exist");
        existence = await fse.exists(inDir);
        assert.ok(existence, "test setup failed - in directory does not exist");
        existence = await fse.exists(outDir);
        assert.ok(existence, "test setup failed - out directory does not exist");

        const directories = {
            base: baseDir,
            in: inDir,
            out: outDir
        };
        const res = await cleanupDirectories(directories);
        assert.equal(res, true);

        // items under baseDir should be cleaned
        existence = await fse.exists(moreDirToMove);
        assert.ok(!existence, "baseDir not cleaned properly");
        existence = await fse.exists(moreDirToMove2);
        assert.ok(!existence, "baseDir not cleaned properly");

        existence = await fse.exists(baseDir);
        assert.ok(!existence, "base directory still exist");
        existence = await fse.exists(inDir);
        assert.ok(!existence, "in directory still exist");
        existence = await fse.exists(outDir);
        assert.ok(!existence, "out directory still exist");

        // work directory should not be deleted
        existence = await fse.exists(path.resolve("work"));
        assert.ok(existence, "work directory does not exist");

        // other items directly under work should not be cleaned
        // this is tested to ensure future concurrency does not trigger bigs
        existence = await fse.exists(moreDir1);
        assert.ok(existence, "work directory original content was removed");
        existence = await fse.exists(moreDir2);
        assert.ok(existence, "work directory original content was removed");
        existence = await fse.exists(moreDir3);
        assert.ok(existence, "work directory original content was removed");

        // cleanup
        await fse.remove(baseDir);
    });

    it("fails when trying to remove directories", async () => {
        const stub = sinon.stub(fse, 'remove').rejects("reject to trigger error");
    
        const res = await cleanupDirectories({
            base: '/dev/null'
        });

        assert.equal(res, false);

        stub.restore();
    });
});