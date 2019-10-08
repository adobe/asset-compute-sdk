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
const nock = require('nock');

const url = "https://upload.wikimedia.org/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg";
const fakeUrl = 'https://fakeurl.com';
const realUrl = "https://nuitesting.blob.core.windows.net/nui-test-library/earth.jpg?sp=rw&st=2019-10-02T21:15:03Z&se=2100-10-03T05:15:03Z&spr=https&sv=2018-03-28&sig=BfAk%2BlCSCjmRjqaH9ALlo1w6oRGXReNMEXNTlKbuBNo%3D&sr=b";
const realUrl2 = "https://nuitesting.blob.core.windows.net/nui-test-library/top8second14FileNum35.jpg?sp=rw&st=2019-10-08T23:06:55Z&se=2119-10-09T07:06:55Z&spr=https&sv=2018-03-28&sig=zo2T88IeEcxiFFXZ3R6OuIdxvWcxoZ1VAjxag%2By5OUs%3D&sr=b";


function createFetchMock() {
	nock("https://upload.wikimedia.org")
        .get("/wikipedia/commons/9/97/The_Earth_seen_from_Apollo_17.jpg")
        .reply(404, "error")
    setTimeout(() => {
        nock.cleanAll();
    }, 500)
}


function createPutFetchMock() {
	nock(fakeUrl)
        .put('/earth.jpg')
        .reply(400, "error")
    setTimeout(() => {
		nock(fakeUrl)
            .put('earth.jpg')
            .reply(200, "success!")
    }, 500)
}

describe('test http upload/download', () => {

    after( () => {
        fs.unlinkSync("./earth.jpg");
        fs.unlinkSync("./earth2.jpg");
        nock.cleanAll()
    })
    afterEach( () => {
        nock.cleanAll();
    })

    it("test http download", async () => {
        const params = {
            source: { url: url }
        };
        const context = {
            infile: './earth.jpg',
            infilename:'earth.jpg'
        }

        await http.download(params, context);
    });

    it("test http upload ", async () => {
		nock(fakeUrl)
            .put('/earth.jpg')
            .reply(200)

        const params = {
            renditions: [
                {
                    name:"earth.jpg",
                    url: `${fakeUrl}/earth.jpg`
                }
            ]
        };
        const result = {
            renditions: {"earth.jpg": {}},
            outdir: './'
        }
        await http.upload(params, result);
    });

    it.skip("download should fail for <1s before succeeding", async () => {
        const params = {
            source: { url: url }
        };
        const context = {
            infile: './earth2.jpg',
            infilename:'earth2.jpg'
        }
        createFetchMock();
        process.env.__OW_DEADLINE = Date.now() + 1000;
        await http.download(params, context);
    });

    it.skip("upload should fail once before succeeding", async () => {

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
        createPutFetchMock();
        process.env.__OW_DEADLINE = Date.now() + 30000;
        await http.upload(params, result);
        expect(result.renditions["earth.jpg"].uploaded).to.be(true);
    });

    it("upload should fail", async () => {
        nock("http://fakeurl3.com")
            .put("/earth.jpg")
            .reply(400, "error!")

        const params = {
            renditions: [{
                name:"earth.jpg",
                url: "http://fakeurl3.com/earth.jpg"
            }]
        };
        const result = {
            renditions: {"earth.jpg": {}},
            outdir: './'
        }
        process.env.__OW_DEADLINE = Date.now() + 2000;
        let threw = true;
        try {
            await http.upload(params, result);
        } catch (e) {
            threw = false;
            expect(e.message).to.be("HTTP PUT upload of rendition earth.jpg failed with 400. Body: error!");
        }
        expect(threw).to.be(false);
    }).timeout(10*1000);


        it("test http upload of multiple renditions", async () => {
			fs.copyFileSync("./earth.jpg", "./earth2.jpg");
			nock("http://fakeurl1.com")
                .put("/earth.jpg")
                .reply(200, "success!");

			nock("http://fakeurl1.com")
                .put("/earth2.jpg")
                .reply(200, "success!");

            const params = {
                ingestionId: 12345,
                renditions: [{
                        name:"earth.jpg",
                        url: "http://fakeurl1.com/earth.jpg"
                    },
                    {
                        name:"earth2.jpg",
                        url: "http://fakeurl1.com/earth2.jpg"
                }]
            };
            const result = {
                renditions: {
                    "earth.jpg": {
                    },
                    "earth2.jpg": {
                    }
                },
                outdir: './'
            }
            const res = await http.upload(params, result);
            expect(res.length).to.be(2);

        });

        it("test http upload of multiple renditions: one fails and one succeeds", async () => {
			fs.copyFileSync("./earth.jpg", "./earth2.jpg");

			nock("http://fakeurl1.com")
                .put("/earth.jpg")
                .reply(200, "success!");

			nock("http://fakeurl1.com")
                .put("/earth3.jpg")
                .reply(400, "error!");
            const params = {
                ingestionId: 12345,
                renditions: [{
                        name:"earth.jpg",
                        url: "http://fakeurl1.com/earth.jpg"
                    },
                    {
                        name:"earth3.jpg",
                        url: "http://fakeurl1.com/earth3.jpg"
                }]
            };
            const result = {
                renditions: {
                    "earth.jpg": {},
                    "earth3.jpg": {}
                },
                outdir: './'
            }
            let threw = true
            try {
                await http.upload(params, result);
            }
            catch (e) {
                threw = false;
                expect(e.message).to.be("Error: ENOENT: no such file or directory, stat 'earth3.jpg'")
            }
            expect(threw).to.be(false);
        });

        // we need to set the header: `"x-ms-blob-type": "BlockBlob"` to run this
        it.skip("unnocked upload test", async () => {

            nock.cleanAll();
            const params = {
                renditions: [{
                    name:"earth.jpg",
                    url: realUrl
                },
                {
                    name:"earth2.jpg",
                    url: realUrl2
                }]
            };
            const result = {
                renditions: {
                    "earth.jpg": {
                    },
                    "earth2.jpg": {
                    }
                },
                outdir: './'
            }
			await http.upload(params, result);
        }).timeout(10*10000);

});