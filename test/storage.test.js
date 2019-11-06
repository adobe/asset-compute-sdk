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

const {getSource, putRendition} = require('../lib/storage');
const mockFs = require('mock-fs');
const nock = require('nock');
const assert = require('assert');
const fs = require('fs-extra');
const { GenericError } = require('@nui/asset-compute-commons');


describe('storage.js', () => {
	describe('getSource', () => {

		beforeEach(() => {
			mockFs();
		})

		afterEach( () => {
			nock.cleanAll();
			mockFs.restore();
			delete process.env.NUI_UNIT_TEST_MODE;
			delete process.env.NUI_DISABLE_RETRIES;
		})
		it('should download simple png and return a new source object', async () => {
			const paramsSource = {
				url: 'https://example.com/photo/elephant.png'
			};
			const inDirectory = './in/fakeSource/filePath';

			mockFs({ './in/fakeSource/filePath': {} });
			assert.ok(fs.existsSync(inDirectory));

			nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(200, 'ok')

			const source = await getSource(paramsSource, inDirectory)

			assert.equal(source.name, 'source.png');
			assert.equal(source.path, 'in/fakeSource/filePath/source.png');
			assert.ok(nock.isDone());
		})

		it('should fail during download', async () => {
			process.env.NUI_DISABLE_RETRIES = true // disable retries to test upload failure
			const paramsSource = {
				url: 'https://example.com/photo/elephant.png'
			};
			const inDirectory = './in/fakeSource/filePath';

			mockFs({ './in/fakeSource/filePath': {} });
			assert.ok(fs.existsSync(inDirectory));

			nock('https://example.com')
                .get('/photo/elephant.png')
                .reply(404, 'ok')

			let threw = false;
			try {
				await getSource(paramsSource, inDirectory)
			} catch (e) {
				console.log(e)
				assert.ok(e instanceof GenericError);
				assert.equal(e.message, "GET 'https://example.com/photo/elephant.png' failed with status 404");
				threw = true;
			}
			assert.ok(threw);
		})

		it('should fail because invalid url', async () => {
			const paramsSource = {
				url: 'http://example.com/photo/elephant.png'
			};
			const inDirectory = './in/fakeSource/filePath';

			mockFs({ './in/fakeSource/filePath': {} });

			let threw = false;
			try {
				await getSource(paramsSource, inDirectory)
			} catch (e) {
				assert.equal(e.message, 'Invalid Https Url: http://example.com/photo/elephant.png');
				threw = true;
			}
			assert.ok(threw);
		})

		it('should not download a file in unittest mode', async () => {
			process.env.NUI_UNIT_TEST_MODE = true;
			const paramsSource = {
				url: './localFile/elephant.psd'
			};
			const inDirectory = './in';

			mockFs({ './localFile/elephant.psd': 'yo' });

			const source = await getSource(paramsSource, inDirectory)

			assert.equal(source.name, './localFile/elephant.psd'); // in this case source name is actual file path
			assert.equal(source.path, 'in/localFile/elephant.psd');
		})

		it('should fail because of invalid localfile in unittest mode', async () => {
			process.env.NUI_UNIT_TEST_MODE = true;
			const paramsSource = {
				url: './localFile/../../evilcode/forHacking/elephant.jpg'
			};
			const inDirectory = './in/fakeSource/filePath';

			mockFs({ './in/fakeSource/filePath': {} });
			let threw = false;
			try {
				await getSource(paramsSource, inDirectory)
			} catch (e) {
				assert.equal(e.message, 'Invalid or missing local file: ./localFile/../../evilcode/forHacking/elephant.jpg')
				threw = true;
			}
			assert.ok(threw);
		})
	})
})