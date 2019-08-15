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

const { GenericError, Reason, SourceUnsupportedError } = require ('../errors.js');
const fs = require('fs-extra');
const mockery = require('mockery');
const process =  require('../library').process;


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

describe('library error handling and processing tests', function() {
    afterEach(function() {
        console.error = originalConsoleError;
        fs.removeSync('in/');

        mockery.deregisterMock(mockJwt);
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

    it("should fail with upload error", function (done) {
        console.error = function() {}
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

        process2(params, options, dummyWorkerFnRendition)
        .catch(err => {
            if (err instanceof GenericError && err.name === 'GenericError' && err.location === "upload_error") {
                threw = true;
            }
        }).then(() => {
            try { expect(threw).to.be.ok(); }
            catch (e) { return done(e); }
            done();
        });
    })

});



/*
describe('test forEachRendition', () => {
    it("test event sending", () => {
        fs.mkdirpSync(path.resolve(__dirname,'/in'));
        fs.writeFileSync(`in/testfile.png`, "./test/files/file.png");
        
        const params = {
            source: "test/files/file.png",
            renditions: [{name:'testfile.png'}]
        };

        forEachRendition(params, dummyRenditionFn)
        .then((r) => {
            console.log(r)
        })
        .catch( (e) => {
            console.log(e);
        })
    })
});
*/

