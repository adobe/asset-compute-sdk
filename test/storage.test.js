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
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const {getSource, putRendition, getWatermark} = require('../lib/storage');
const mockFs = require('mock-fs');
const nock = require('nock');
const assert = require('assert');
const fs = require('fs-extra');
const path = require('path');
const { GenericError, RenditionFormatUnsupportedError } = require('@adobe/asset-compute-commons');


const EMBED_LIMIT_MAX = 32 * 1024;
describe('storage.js', () => {
    describe('getSource', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });

        it('should download simple png and return a new source object', async () => {
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'ok');

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'source.png');
            assert.equal(source.path, 'in/fakeSource/filePath/source.png');
            assert.ok(nock.isDone());
        });

        it('should download data uri and return new source object', async () => {
            const paramsSource = {
                url: 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ%3D%3D'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'source');
            assert.equal(source.path, 'in/fakeSource/filePath/source');
            assert.ok(fs.existsSync(source.path));
            assert.equal(fs.readFileSync(source.path).toString(), 'Hello, World!');
            assert.ok(nock.isDone());
        });

        it('should fail during download', async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            const paramsSource = {
                url: 'https://example.com/photo/elephant.png'
            };
            const inDirectory = './in/fakeSource/filePath';

            mockFs({ './in/fakeSource/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(404, 'ok');

            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                console.log(e);
                assert.ok(e instanceof GenericError);
                assert.equal(e.message, "GET 'https://example.com/photo/elephant.png' failed with status 404");
                threw = true;
            }
            assert.ok(threw);
        });

        it('should not download a file in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg'
            };
            const inDirectory = '/in';

            mockFs({ '/in/file.jpg': 'yo' });

            const source = await getSource(paramsSource, inDirectory);

            assert.equal(source.name, 'file.jpg'); // in this case source name is actual file path
            assert.equal(source.path, '/in/file.jpg');
        });

        it('should fail to download because path ends with /..', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file.jpg/..'
            };
            const inDirectory = '/in';

            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file file.jpg/..');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of invalid localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'file/../../../../evilcode/elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file file/../../../../evilcode/elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because of missing localfile in worker test mode', async () => {
            process.env.WORKER_TEST_MODE = true;
            const paramsSource = {
                url: 'elephant.jpg'
            };
            const inDirectory = '/in';
            let threw = false;
            try {
                await getSource(paramsSource, inDirectory);
            } catch (e) {
                assert.equal(e.message, 'Invalid or missing local file elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });
    });

    describe('putRendition', () => {

        beforeEach(() => {
            mockFs();
        });

        afterEach( () => {
            nock.cleanAll();
            mockFs.restore();
            delete process.env.WORKER_TEST_MODE;
            delete process.env.ASSET_COMPUTE_DISABLE_RETRIES;
        });

        it('should upload simple rendition', async () => {
            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return false; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(nock.isDone());

        });

        it('should upload simple rendition (not in test mode)', async () => {
            delete process.env.WORKER_TEST_MODE;

            mockFs({ "./storeFiles/jpg": {
                "fakeEarth.jpg": "hello world!"
            } });
            const file = "./storeFiles/jpg/fakeEarth.jpg";

            const rendition = {
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return false; }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(nock.isDone());
        });

        it('should copy simple rendition, but not upload (in test mode)', async () => {
            process.env.WORKER_TEST_MODE = true;

            mockFs({
                "./storeFiles/jpg": {
                    "fakeEarth.jpg": "hello world!"
                }
            });
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const requestedFile = "./storeFiles/jpg/rendition.jpg";

            const rendition = {
                name: "simple-rendition.png",
                directory: "./storeFiles/jpg",
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                instructions: { name: path.basename(requestedFile) }
            };

            nock("https://example.com")
                .put("/fakeEarth.jpg", "hello world!")
                .reply(200);

            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(fs.existsSync(file));
            assert.ok(fs.existsSync(requestedFile));
            assert.ok(! nock.isDone());
        });

        it('should embed small rendition, but not upload', async () => {
            mockFs({
                "./storeFiles/jpg": {
                    "fakeEarth.jpg": "hello world!"
                }
            });
            const file = "./storeFiles/jpg/fakeEarth.jpg";
            const requestedFile = "./storeFiles/jpg/rendition.jpg";

            const rendition = {
                directory: "./storeFiles/jpg",
                path: file,
                target: "https://example.com/fakeEarth.jpg",
                instructions: {
                    name: path.basename(requestedFile),
                    embedBinaryLimit: EMBED_LIMIT_MAX
                },
                size: () => 1,
                contentType: () => { return "image/jpeg"; },
                shouldEmbedInIOEvent: () => { return true; },
            };


            assert.ok(fs.existsSync(file));
            await putRendition(rendition);
            assert.ok(fs.existsSync(file));
        });
    });

    describe.only('getWatermark', () => {

        beforeEach(async function () {
            process.env.WORKER_BASE_DIRECTORY = 'build/work';
            await fs.mkdirs('build/work', { recursive: true });
        });

        afterEach(() => {
            delete process.env.WORKER_BASE_DIRECTORY;
        });

        it('should download simple png and return a new watermark object', async () => {
            const inDirectory = './test/files';
            const params = {
                watermarkContent: 'https://example.com/photo/elephant.png'
            };

            const watermark = await getWatermark(params, inDirectory, true);

            assert.equal(watermark.name, 'watermark.png');
            assert.equal(watermark.path, 'test/files/watermark.png');
        });

        it('should download data uri and return new watermark object', async () => {
            const base64Watermark = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAAD6CAYAAACI7Fo9AAABhGlDQ1BJQ0MgcHJvZmlsZQAAKJF9kT1Iw0AcxV9bpUUqDq0g4pChOlkQK+KoVShChVArtOpgcukXNGlIUlwcBdeCgx+LVQcXZ10dXAVB8APEydFJ0UVK/F9SaBHjwXE/3t173L0D/M0qU82eCUDVLCOTSgq5/KoQfEUIYQwigYjETH1OFNPwHF/38PH1Ls6zvM/9OfqVgskAn0A8y3TDIt4gnt60dM77xFFWlhTic+Jxgy5I/Mh12eU3ziWH/TwzamQz88RRYqHUxXIXs7KhEk8RxxRVo3x/zmWF8xZntVpn7XvyF4YL2soy12mOIIVFLEGEABl1VFCFhTitGikmMrSf9PAPO36RXDK5KmDkWEANKiTHD/4Hv7s1i4lJNymcBHpfbPtjFAjuAq2GbX8f23brBAg8A1dax19rAjOfpDc6WuwIGNgGLq47mrwHXO4AQ0+6ZEiOFKDpLxaB9zP6pjwQuQX61tze2vs4fQCy1FX6Bjg4BMZKlL3u8e5Qd2//nmn39wN/lHKsy4UFWAAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB+QIDBU4G7ywE8EAAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAG9klEQVR42u3d623cyBKA0aY1GcgEHIIz2TA2tg1jMzJATwYrzP6SYVgzGj6bVd3nAPfPAtfWwx+rmqJmSgEAAAAAAABmGnwJjjOVcvvzv42+5pzgiy8BCB0QOiB0QOiA0AGhA0IHhA5CB4QOCB0QOiB0QOiA0AGhg9ABoQNCB4QOCB0QOiB0QOggdEDogNABoQNCB4QO7OPiS9CGlzLd7v33tzJ6P3ZMdBA6IHRir+0gdBA6IHRScMcdoTufI3RMc4QOCB1rO0IHhM7Wae58jtBB6IDQsbYjdM4lcoQOQqeFtR2Ebm1H6IDQAaHz0VRKtbO0tR2hN8SNOIQOCN00R+iA0NnHWMqqm2aebUfoAdW84w5Cb5xpjtAb4SYcQjfNQeiRrL0RB0K3toPQz1Djjru1HaEDQre2I3TCs7Yj9KDccUfoWNsROtZ2hG6ag9ABoVvbETrWdoTOB0c9/mqaI3TTHIQOCD38NLe2I/QEPP6K0DHNEXomXuIZoWOaI3RA6E2u7aY5Qm+EO+4I3dncNEfoLa/tIPTG13bTnDNcak663s+sfnGF5kIX/7LITXOaXt0zn3EffezutiN0THP6DL3nO9cix0Rv/HwucoTeyPncnXaEDgi91ZUdhJ54bV8SufM5NV1q/4VjKcO9UKZSbu/n26yPic79+bnIaT5005xsXqeP3/PruP2hqHt/7iNb/750q3v0iKzsHHWxWXJhcEY/aJrPWdtFTler+6Nz+pKpGTEaKzt7ruvhQ2/xkdZn09zKzpkhh5zon8U098511KkuclELvdNpjsjX2OPO/mGhb71hle2sbmUXc9S4TfRdp3nxGnDiDhl3iNA/e0LuW5KpbmUXdISIq4fe2t1205yMUVvdK2k58tudSTiMfb9G3jXB5x8y9B9lLN/KdOr6HulO+9GvnutFLtuM+3enPgK79B9ShklZ84Jz5tEly9Hrz//1emGyugef5ux70fn154zz/z/fp/0/ntrbUjO/1PJSppsAIWjoe6/vW2PfMs3daUfojWwNrZ2RvRus0MNO9aOC3PL4bu27/jW+J+66tyPlzbi3Mla/Ieb8n28Y7PVjydcG3hz0S9Zv5FsZh8+m6J5hRprm4Iy+IfbP4qp5A+5Z5NZpugz96LvwkcKq9bG4mAi9ycmeZZpDE6GvnSRzglsz2Zc8b29lR+gBVvjMf5/IaS70z/5RP5t6a87rj/7MSNMcTPTk24OVnW5D3zrVj/z5upUdoSdjZUboyQPdMtUfTdLWprkLndC7nsa1nmv3Ek4IfQe1noWH6FK/lNSS92pbsjK/BF5pvQorJvrCqX7vZ+Vnr+0g9AOCmftgTC8vE+X+gNDTxv4s0vfYI/wjjxzabbKFCL2CIx9LrfnIKwj9pKle83xumiP0A609Z3sZZ4QeaOrNuTH3Y8lbdGCaCz3m9J1D7PvxM3yhh5vqfna97zQXudBPtecK73yO0INOdSu8szkdTPQla7rY10Xe+9r+muwimDr0Pab6WMpgPTfJW3fJ/gmMpQx73GQT+3xuwlndw67v7riLXOgNTPWtZ3VE/si1gc+7i0dgxb79fG6SC70qLwF13MXvq1/gE/rWFfrM9T3ixwsmesILDQgdEPoja362baqv89n53I04oVvhGydyoYsdkri0/MmJHRqf6OxzPkfoOJ8j9ON4Om4bjwQLHRD6c26AOZ8Tz8WXAOfz42196amtvyp7SOh7TvW3Mg7O5M7nPcRsouMiFPjYmOGFIoUupGY+rt//nFrRZ3k1WKFz2vn8yAtPjYtappd8FnqwyXbUJIo2zc/6eNb+vd8P+Fhqvhad0K3sHCTSi0oKXeQ0HPg7T8Z1zMMyM9f2KXfkQj/Ro7P4nhPYNDfJre4uNMOtoQvB+4Xz2cVt7s3OpXfUo7/Jg9A7PJtH+H2Eoz6G2p9blndxSRG6N0C0slvVTfTU6+beUc5dXb310vo1PSOhB53IS1dQU1zgQreq/3KbXBB6i1zonR0TSinl1vnkf+30Qufn6A149uDLs3O5yJfL9p7pJnqASXtv9d7rF1yW/Bkt3ohbE/e1wa+D0IOfveeG+nUq5ef4OPDeprnAhZ42+rmxL428tUku8jvfYwnliHjJmXzxP4Lk/8i3nL2vnTw34GZckHP6aVf6jiPvidU9UOweejk+8GunL2NtdU+6wu+xvmeb5lZ0q3t3K/wwlmFLqD1FjomecsL3+LZXS0K/epcZZ/RWJzwit7ojchMdxA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEDjvMvFE/9c/n345n5///eXr1+D39sWv69DL1GSQ83IerqIe+81XKw74N1UQeiA0IEU3DXGmfwOP1EBAAAAAAAAAAAAAAAAAIDyP1qDhlo0gQmyAAAAAElFTkSuQmCC';
            const instructions = {
                watermarkContent: base64Watermark
            };

            const workDirectory = path.join(process.env.WORKER_BASE_DIRECTORY, 'valid-data-uri');
            await fs.mkdirs(workDirectory, { recursive: true });

            const watermark = await getWatermark(instructions, workDirectory);

            assert.ok(watermark);

            // compare files by buffer
            // note that forcing to save as jpg will loose the transparency
            const expectedFile = await fs.readFile('./test/files/watermark.png');
            const outFile = await fs.readFile(watermark.path);
            assert.ok((expectedFile).equals(outFile));

            // remove rendition from after success
            await fs.remove(workDirectory);
        });

        it('should fail during download', async () => {
            process.env.ASSET_COMPUTE_DISABLE_RETRIES = true; // disable retries to test upload failure
            const params = {
                watermarkContent: 'https://example.com/photo/elephant.png'
            };
            const inDirectory = './in/fakeWatermark/filePath';

            mockFs({ './in/fakeWatermark/filePath': {} });
            assert.ok(fs.existsSync(inDirectory));

            nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(404, 'ok');

            let threw = false;
            try {
                await getWatermark(params, inDirectory);
            } catch (e) {
                console.log(e);
                assert.ok(e instanceof GenericError);
                assert.equal(e.message, "GET 'https://example.com/photo/elephant.png' failed with status 404");
                threw = true;
            }
            assert.ok(threw);
        });

        it('should fail because watermark asset is not png', async () => {
            let threw = false;
            try {
                await getWatermark({ watermarkContent: "https://example.com/photo/elephant.jpg" });
            } catch (e) {
                assert.equal(e.reason, 'RenditionFormatUnsupported');
                assert.equal(e.message, 'Invalid watermark format https://example.com/photo/elephant.jpg');
                threw = true;
            }
            assert.ok(threw);
        });
    });
});
