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

const { RenditionTooLarge } = require ('../../errors.js');
const http =  require('../../src/storage/http');
const fs = require('fs-extra');
const assert = require('assert')
const nock = require('nock');
const rimraf = require('rimraf');
const util = require('util');
const expect = require('expect.js');

const removeFiles = util.promisify(rimraf);

const azureUrl1 = 'https://nuitesting.blob.core.windows.net/nui-test-multipart-upload/file.ai?sp=rw&st=2019-10-04T16:42:29Z&se=2030-01-02T01:42:29Z&spr=https&sv=2018-03-28&sig=Qcb66oogH7Jn9OUpRJRqYe4rDe%2FW2XVr1PZ4XxtWVGU%3D&sr=b';
const azureUrl2 = 'https://nuitesting.blob.core.windows.net/nui-test-multipart-upload/file.dn?sp=r&st=2019-10-04T16:44:23Z&se=2030-10-05T00:44:23Z&spr=https&sv=2018-03-28&sig=tkxVd5uMr5pSjJEDdIkvfOUna4pPIxalXnTUW%2BsqKQI%3D&sr=b';

// Need to set the header: "x-ms-blob-type": "BlockBlob"` to run this
it.skip('Unmocked multi part upload with 2 urls', async function() {
  const sourceFile = 'file.jpg';
  const fileSize = fs.statSync(sourceFile).size;
  const maxSize = fileSize - 1;
  const target = {
    urls: [ azureUrl1, azureUrl2 ],
    minPartSize: 100,
    maxPartSize: maxSize
  }
  try {
    await http.upload(sourceFile, target);
  } catch (err) {
    assert(false);
  }
}).timeout(5000);


describe('http multipart tests', function() {
  beforeEach(async function() {
  })
  afterEach(async function() {
    nock.cleanAll();
    try {
      await removeFiles("rendition*");
    } catch (err) {
      // Don't allow error to break tests.  We are just trying to do cleanup.
      console.log('error removing files ' + err);
    }
   })

  function _buildMultipartData(minPartSize=0, maxPartSize=-1, urlCount=5, renditionCount=1, addFiles=true) {
    const renditions = [];
    const results = {};
    for (let i = 0; i < renditionCount; i++) {
      const renditionName = `rendition${i+1}`;
      if (addFiles) {
        fs.writeFileSync(renditionName, 'hello multipart uploading world!\n', 'utf8');
      }
      const urls = [];
      for (let u = 0; u < urlCount; u++) {
        urls.push(`http://unittest/${renditionName}_${u+1}`);
      }
      renditions.push({
        name: renditionName,
        target: {
          minPartSize,
          maxPartSize,
          urls
        }
      });
      results[renditionName] = true;
    }

    return {
      params: {
        ingestionId: 'unit_test',
        renditions
      }, result: {
        renditions: results,
        outdir: '.'
      }
    };
  }

  it('single upload', async () => {
    const data = _buildMultipartData(0, 10, 1);
     nock('http://unittest')
    .matchHeader('content-length', 33)
    .put('/rendition1_1', 'hello multipart uploading world!\n')
    .reply(201)
    data.params.renditions[0].target = 'http://unittest/rendition1_1';
    try {
      await http.upload(data.params, data.result);
    } catch (err) {
        console.log(err);
        assert(false);
    }
    assert(nock.isDone());
  });

  it('single upload_no_target', async () => {
    const data = _buildMultipartData(0, 10, 1);
     nock('http://unittest')
    .matchHeader('content-length', 33)
    .put('/rendition1_1', 'hello multipart uploading world!\n')
    .reply(201)
    delete data.params.renditions[0].target;
    data.params.renditions[0].url = 'http://unittest/rendition1_1';
    try {
      await http.upload(data.params, data.result);
    } catch (err) {
        console.log(err);
        assert(false);
    }
    assert(nock.isDone());
  });

  it('test multipart upload', async () => {
    const data = _buildMultipartData(5, 7, 5);
     nock('http://unittest')
    .matchHeader('content-length',7)
    .put('/rendition1_1', 'hello m')
    .reply(201);
    nock('http://unittest')
    .matchHeader('content-length', 7)
    .put('/rendition1_2', 'ultipar')
    .reply(201);
    nock('http://unittest')
    .matchHeader('content-length', 7)
    .put('/rendition1_3', 't uploa')
    .reply(201);
    nock('http://unittest')
    .matchHeader('content-length', 7)
    .put('/rendition1_4', 'ding wo')
    .reply(201);
    nock('http://unittest')
    .matchHeader('content-length', 5)
    .put('/rendition1_5', 'rld!\n')
    .reply(201);

    try {
      await http.upload(data.params, data.result);
    } catch (err) {
        console.log(err);
        assert(false);
    }
    assert(nock.isDone());
  });

  it('test multiple renditions', async function() {
    const data = _buildMultipartData(5, 20, 2, 2);
      nock('http://unittest')
        .matchHeader('content-length',17)
        .put('/rendition1_1', 'hello multipart u')
        .reply(201);
      nock('http://unittest')
        .matchHeader('content-length', 16)
        .put('/rendition1_2', 'ploading world!\n')
        .reply(201);
      nock('http://unittest')
        .matchHeader('content-length',17)
        .put('/rendition2_1', 'hello multipart u')
        .reply(201);
      nock('http://unittest')
        .matchHeader('content-length', 16)
        .put('/rendition2_2', 'ploading world!\n')
        .reply(201);

    try {
        await http.upload(data.params, data.result);
    } catch (err) {
        console.log(err);
        assert(false);
    }
    assert(nock.isDone());
  }).timeout(5000);

  it('test multiple renditions with failure', async function() {
      const data = _buildMultipartData(5, 20, 2, 2);
      nock('http://unittest')
        .matchHeader('content-length',17)
        .put('/rendition1_1', 'hello multipart u')
        .reply(201);
      nock('http://unittest')
        .matchHeader('content-length', 16)
        .put('/rendition1_2', 'ploading world!\n')
        .reply(201);
      nock('http://unittest')
        .matchHeader('content-length',17)
        .put('/rendition2_1', 'hello multipart u')
        .reply(500); // invokes retry
      nock('http://unittest')
        .matchHeader('content-length',17)
        .put('/rendition2_1', 'hello multipart u')
        .reply(201); // retry succeeds
      nock('http://unittest')
        .matchHeader('content-length', 16)
        .put('/rendition2_2', 'ploading world!\n')
        .reply(201);
      await http.upload(data.params, data.result);
      assert(nock.isDone());
  }).timeout(5000);

  it('test multiple renditions with RenditionTooLarge failure', async function() {
    const data = _buildMultipartData(0, 33, 1, 1);
      nock('http://unittest')
        .matchHeader('content-length',33)
        .put('/rendition1_1', 'hello multipart uploading world!\n')
        .reply(413, 'The request body is too large ');
    let threw = false;
    try {
        await http.upload(data.params, data.result);
    } catch (err) {
      assert(err.name === 'RenditionTooLarge');
      threw = true;
    }
    expect(threw).to.be.ok();
  }).timeout(5000);

  it('test insufficient urls', async () => {
    const data = _buildMultipartData(0, 7, 2);
    let threw = false;
    try {
      await http.upload(data.params, data.result);
    }
    catch (e) {
      console.log(e);
      assert(e instanceof RenditionTooLarge);
      threw = true;
    }
    expect(threw).to.be.ok();
  });

  it('test min part size', async () => {
    nock('http://unittest')
      .matchHeader('content-length',20)
      .put('/rendition1_1', 'hello multipart uplo')
      .reply(201);
    nock('http://unittest')
      .matchHeader('content-length',13)
      .put('/rendition1_2', 'ading world!\n')
      .reply(201);

    const data = _buildMultipartData(20, 100);
    await http.upload(data.params, data.result);
    assert(nock.isDone());
  });

  it('test multipart upload missing file', async () => {
    const data = _buildMultipartData(0, 10, 5, 1, false);
    let threw = false;
    try {
      await http.upload(data.params, data.result);
    }
    catch (err) {
      assert(err.name === 'GenericError');
      assert(err.location === 'upload_error');
      threw = true;
    }
    expect(threw).to.be.ok();
  });

});
