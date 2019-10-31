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

const expect = require('expect.js');
const assert = require('assert');

const { GenericError, Reason, SourceUnsupportedError } = require ('../errors.js');
const fs = require('fs-extra');
const mockery = require('mockery');
const nock = require('nock');
const {forEachRendition, process} =  require('../library');
const proc = require('process');

const rewire = require('rewire');
const lib = rewire('../library.js');
const sourceFilename = lib.__get__('sourceFilename');
const renditionFilename = lib.__get__('renditionFilename');

const url = 'http://hostname/testfile.png';

const originalConsoleError = console.error;



// Dummy Worker function that returns a resolved promise
function dummyWorkerFn(infile) {
    console.log(`infile is ${infile}`);
    expect(infile).to.equal(url);
    return Promise.resolve();
}

// Worker function varifies that it is passed the url, not a file name 
// Worker fails because of source unsupported
function workerFn(infile) {
    console.log(`infile is ${infile}`);
    expect(infile).to.equal(url);
    return Promise.reject(new SourceUnsupportedError(`Source unsupported: ${infile}`))
}

// Dummy Worker function that returns rendition
function dummyWorkerFnRendition(infile) {
    console.log(`infile is ${infile}`);
    expect(infile).to.equal(url);
    fs.writeFileSync(`out/testfile.png`, "./test/files/file.png");
    return Promise.resolve({fmt:"png"});
}

// mock a JWT
const mockJwt = {
    decode: function(accessToken) {
        console.log(`Mock accessToken ${accessToken}`)
        return { clientId:"1245" }
    }
}

// mock cgroup-metrics
const mockCgroupMetrics = {
    metrics: () => {
        const rand1 = Math.floor(Math.random() * 100);
        const rand2 = Math.floor(Math.random() * 100);
        return {
            "memory.containerUsage": rand1,
            "memory.containerUsagePercentage": 0.1,
            "cpuacct.usage": rand1,
            "cpuacct.stat.user": 3,
            "cpuacct.stat.system": 5,
            "cpuacct.usage_percpu": [rand1, rand2, 400, 100]
        }

    }
}

proc.env.__OW_ACTION_NAME = '112/worker-test';

describe('library source filename tests', function() {
    it('source as string tests', function() {
        let source = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(sourceFilename(source), `source.jpg`);
        source = '';
        assert.strictEqual(sourceFilename(source), 'source');
    });
    it('source.name tests', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890.jpg';
        assert.strictEqual(sourceFilename(source), `source.jpg`);
        source.name =  `  %789.PSD`;
        assert.strictEqual(sourceFilename(source), `source.PSD`);
        source.name =  `!@#$%^&*().png`;
        assert.strictEqual(sourceFilename(source), `source.png`);
        source.name = '';
        assert.strictEqual(sourceFilename(source), 'source');
    });
    it('source.name with mime type tests', function() {
        const source = { };
        source.name = 'abcdz-AZ1234567890';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(sourceFilename(source), `source.jpeg`);
        source.name =  '';
        source.mimeType = 'unknown mimeType'
        assert.strictEqual(sourceFilename(source), 'source');
        source.name = 'foo.png';
        source.mimeType = 'image/jpeg';
        assert.strictEqual(sourceFilename(source), `source.png`);
    });
    it('source.url tests', function() {
        const source = { url: ''};
        source.url = 'https://server.name/file.jpg?queryPortion';
        assert.strictEqual(sourceFilename(source), `source.jpg`);
        source.url = 'http://server.name/directory/file%20.png?query';
        assert.strictEqual(sourceFilename(source), `source.png`);
        source.url = 'http://server.name/directory/file%20.png?';
        assert.strictEqual(sourceFilename(source), `source.png`);
        source.url = 'xxx://server.name/directory/file.png?query';
        assert.strictEqual(sourceFilename(source), `source.png`);
        source.url = 'NotAUrl';
        assert.strictEqual(sourceFilename(source), 'source');
        source.url='';
        assert.strictEqual(sourceFilename(source), 'source');
        source.mimeType ='image/png';
        assert.strictEqual(sourceFilename(source), `source.png`);
    });
    it('empty source object', function() {
        const source = { };
        assert.strictEqual(sourceFilename(source), 'source');
    });
});

describe('library rendition filename tests', function() {
    it('rendition.fmt undefined', function() {
        const rendition = { };
        assert.strictEqual(renditionFilename(rendition, 1), `rendition1`);
    });
    it('rendition.fmt set strangely', function() {
        const rendition = { fmt: '  '};
        assert.strictEqual(renditionFilename(rendition, 1), `rendition1.  `);
    });
    it('rendition.fmt defined', function() {
        const rendition = { fmt: 'gif' };
        assert.strictEqual(renditionFilename(rendition, 1), `rendition1.gif`);
    });
});

describe('library error handling and processing tests', function() {
    afterEach(function() {
        console.error = originalConsoleError;
        fs.removeSync('in/');

        mockery.deregisterMock(mockJwt);
        mockery.deregisterMock(mockCgroupMetrics);
        mockery.disable();
       
    });
    
    it('test process', function(done) {
        const params = {
            source: url,
            renditions: []
        };
        const options = {
        disableSourceDownloadSource: true
        };
        process(params, options, workerFn)
        .then(() => { done(Error('process should fail'))})
        .catch(() => { console.log('in catch as we should'); done(); })
    });


    it("should fail with GenericError because no source url found", function(done) {
        console.error = function() {}
        const params = {
            source: {},
            renditions: []
        };
        let threw = false;

        process(params, dummyWorkerFn)
        .catch(err => {
            if (err instanceof GenericError && err.name === 'GenericError') {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    })

    it("should fail because of a download error", function(done) {
        nock("http://fakeurl")
            .get("/testfile.png")
            .reply(400);
    
        console.error = function() {}
        const params = {
            source: "http://fakeurl/testfile.png",
            renditions: []
        };
        let threw = false;

        process(params, dummyWorkerFn)
        .catch(err => {
            console.log(`error from library: ${err}`)
            if (err instanceof GenericError) {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    })

    it("should fail because of a local download error", function(done) { 
        console.error = function() {}
        const params = {
            source: "fake_testfile.png",
            renditions: []
        };
        let threw = false;

        process(params, dummyWorkerFn)
        .catch(err => {
            console.log('Expected error: GenericError', err.location);
            if (err instanceof GenericError && err.location === 'local_download_error') {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    });

    it("should fail because of a specific worker error (source unsupported)", function(done) { 
        console.error = function() {}
        const params = {
            source: url,
            renditions: []
        };
        let threw = false;
        const options = {
            disableSourceDownloadSource: true
            };

        process(params, options, workerFn)
        .catch(err => {
            console.log('Expected errorReason: SourceUnsupported', err.name);
            if (err instanceof SourceUnsupportedError && err.reason === Reason.SourceUnsupported) {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    })

    it("should fail with GenericError because no source found", function(done) {
        console.error = function() {}
        const params = {
            renditions: []
        };
        let threw = false;
        process(params, dummyWorkerFn)
        .catch(err => {
            console.log(err);
            if (err instanceof GenericError && err.name === 'GenericError') {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    });

    it("should fail with upload error", async () => {
        console.error = function() {};
        mockery.enable({
            warnOnUnregistered: false,
            useCleanCache: true
        });
    
        mockery.registerMock('jsonwebtoken', mockJwt);

        // must require the module after registering the mock 
        const process2 = require('../library').process;
        const { GenericError } = require ('../errors.js');

        const params = {
            source: url,
            renditions: [{
                fmt:"png",
                name:"testfile.png"
            }],
            auth: {
                accessToken:true,
                orgId:true
            }
        };
        let threw = false;
        const options = {
            disableSourceDownloadSource: true
        };

        try {
            await process2(params, options, dummyWorkerFnRendition)
        }
        catch(err) {
            if (err instanceof GenericError && err.name === 'GenericError' && err.location === "upload_error") {
                threw = true;
            }
        }
        expect(threw).to.be.ok();
    })

    it('test process with cgroup metrics', async () => {
        // to verfiy metrics, add log statements printing out metrics
        console.error = function() {}
        mockery.enable({
            warnOnUnregistered: false,
            useCleanCache: true
        });

        mockery.registerMock('jsonwebtoken', mockJwt);
        mockery.registerMock('cgroup-metrics', mockCgroupMetrics);

        const process2 = require('../library').process;
        const { GenericError } = require ('../errors.js');
        proc.env.__OW_DEADLINE = Date.now() + 500 // should timeout in <1 second


        const params = {
            source: url,
            renditions: [{
                fmt:"png",
                name:"testfile.png"
            }],
            auth: {
                accessToken:true,
                orgId:true
            }
        };
        let threw = false;
        const options = {
            disableSourceDownloadSource: true
        };

        try {
            await process2(params, options, dummyWorkerFnRendition)
        }
        catch(err) {
            if (err instanceof GenericError && err.name === 'GenericError' && err.location === "upload_error") {
                threw = true;
            }
        }
        expect(threw).to.be.ok();
    });
});

describe('forEachRendition tests', function() {
    it('should text rendition with no name provided', async () => {
        // Dummy Rendition function that resolves
        function ValidateRenditionNameFn(infile, rendition, outdir) {
            assert.equal(infile, 'in/source.jpg');
            assert.equal(rendition.name, 'rendition0.png');
            fs.writeFileSync(`${outdir}/${rendition.name}`, "hello world");
            return Promise.resolve(rendition);
        }
        nock('https://example.com')
            .get('/MySourceFile.jpg')
            .reply(200, "hello world");
        nock('https://example.com')
            .put('/MyRendition.png')
            .reply(200);

        const params = {
            source: 'https://example.com/MySourceFile.jpg',
            renditions: [{
                fmt:"png",
                target:"https://example.com/MyRendition.png"
            }]
        };
        await forEachRendition(params, ValidateRenditionNameFn);

    })
})




