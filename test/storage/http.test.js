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
const expect = require('expect.js');
const fs = require('fs-extra');
const http = require('../../src/storage/http');
const fetchMock = require('fetch-mock');

const url = "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg";
const fakeUrl = 'https://fakeurl.com';

fetchMock.config.overwriteRoutes = true;

function createFetchMock() {
    fetchMock.mock(url, 404);
    setTimeout(() => {
        fetchMock.reset();
    }, 500)
}

function createPutFetchMock() {
    fetchMock.put(fakeUrl, 500);
    setTimeout(() => {
        fetchMock.put(fakeUrl, 200);
    }, 500)
}

describe('test http upload/download', () => {

    after( () => {
        fs.unlinkSync("./earth.jpg");
        fs.unlinkSync("./earth2.jpg");
    })
    afterEach( () => {
        fetchMock.reset();
    })

    it("test http download", done => {
        const params = {
            source: { url: url }
        };
        const context = {
            infile: './earth.jpg',
            infilename:'earth.jpg'
        }
        let threw = true;
        http.download(params, context)
        .catch( (e) => {
            threw = false;
            console.log(e);
        }).then(() => {
            try {
                expect(threw).to.be(true);
            } catch (e) {
                return done(e);
            }
            return done();
        })
    });


    it("test http upload", done => {
        fetchMock.put(fakeUrl, 200);

        const params = {
            renditions: [{
                name:"earth.jpg",
                url: fakeUrl
            }]
        };
        const result = {
            renditions: {"earth.jpg": {}},
            outdir: './'
        }
        let threw = true;
        http.upload(params, result)
        .catch( (e) => {
            threw = false;
            console.log(e);
        })
        .then( () => {
            try {
                expect(threw).to.be(true);
            } catch (e) {
                return done(e);
            }
            return done();
        })
    });

    it("download should fail for <1s before succeeding", done => {
        const params = {
            source: { url: url }
        };
        const context = {
            infile: './earth2.jpg',
            infilename:'earth2.jpg'
        }
        createFetchMock();
        let threw = true;
        process.env.__OW_DEADLINE = Date.now() + 30000;
        http.download(params, context)
        .catch( (e) => {
            threw = false;
            console.log(e);
        }).then(() => {
            try {
                expect(threw).to.be(true);
            } catch (e) {
                return done(e);
            }
            return done();
        })
    });

    it("upload should fail once before succeeding", done => {

        const params = {
            renditions: [{
                name:"earth.jpg",
                url: fakeUrl
            }]
        };
        const result = {
            renditions: {"earth.jpg": {}},
            outdir: './'
        }
        let threw = true;
        createPutFetchMock();
        process.env.__OW_DEADLINE = Date.now() + 30000;
        http.upload(params, result)
        .catch( (e) => {
            threw = false;
            console.log(e);
        })
        .then( () => {
            try {
                expect(threw).to.be(true);
            } catch (e) {
                return done(e);
            }
            return done();
        })

});

});


