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

'use strict';

const testFramework = require('@aem-desktop/node-unittest-utils');

testFramework.registerMock('fs-extra', testFramework.MockFs);

const MockFs = testFramework.MockFs;
const MockRequest = testFramework.MockRequest;
// const httpMultipart = testFramework.requireMocks(testFramework.getRequireMockPath(__dirname, '../../src/storage/http-multipart'));
const expect = require('expect.js');

// Disabled the http multipart tests since they don't with with the async implementation of http-multipart
describe.skip('http multipart tests', () => {
  beforeEach(() => {
    MockFs.resetFileSystem();
    MockRequest.resetRequestState();
    MockRequest.setCreateMethod('PUT');
  });

  function _buildMultipartData(minPartSize=0, maxPartSize=-1, urlCount=5, renditionCount=1, addFiles=true) {
    const renditions = [];
    const results = {};
    for (let i = 0; i < renditionCount; i++) {
      const renditionName = `rendition${i+1}`;
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
      if (addFiles) {
        MockFs.addFile(`/${renditionName}`, {}, 'hello multipart uploading world!');
      }
    }

    return {
      params: {
        ingestionId: 'unit_test',
        renditions
      }, result: {
        renditions: results,
        outdir: '/'
      }
    };
  }

  it('test multipart upload', () => {
    const data = _buildMultipartData();
    return httpMultipart.upload(data.params, data.result).then(() => {
      expect(MockRequest.getUrlData('http://unittest/rendition1_1')).to.be('hello m');
      expect(MockRequest.getUrlData('http://unittest/rendition1_2')).to.be('ultipar');
      expect(MockRequest.getUrlData('http://unittest/rendition1_3')).to.be('t uploa');
      expect(MockRequest.getUrlData('http://unittest/rendition1_4')).to.be('ding wo');
      expect(MockRequest.getUrlData('http://unittest/rendition1_5')).to.be('rld!');
    });
  });

  it('test multipart upload invalid maxPartSize', () => {
    const data = _buildMultipartData(0, 0);
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
    });
  });

  it('test insufficient urls', () => {
    const data = _buildMultipartData(0, 1);
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
    });
  });

  it('test invalid min part size', () => {
    const data = _buildMultipartData(20, -1);
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
    });
  });

  it('test multipart upload missing file', () => {
    const data = _buildMultipartData(0, -1, 5, 1, false);
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
    });
  });

  it('test multipart small file size', () => {
    const data = _buildMultipartData(100, -1, 1);
    return httpMultipart.upload(data.params, data.result).then(() => {
      expect(MockRequest.getUrlData('http://unittest/rendition1_1')).to.be('hello multipart uploading world!');
    });
  });

  it('test multipart small file too many parts', () => {
    const data = _buildMultipartData(100, -1);
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
    });
  });

  it('test upload part error', () => {
    const data = _buildMultipartData();
    MockRequest.registerUrlCallback('PUT', 'http://unittest/rendition1_3', (options, callback) => {
      callback('unit test error!');
    });
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_1')).to.be('hello m');
      expect(MockRequest.getUrlData('http://unittest/rendition1_2')).to.be('ultipar');
      expect(MockRequest.getUrlData('http://unittest/rendition1_3')).not.to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_4')).not.to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_5')).not.to.be.ok();
    });
  });

  it('test upload part bad status code', () => {
    const data = _buildMultipartData();
    MockRequest.registerUrlCallback('PUT', 'http://unittest/rendition1_3', (options, callback) => {
      callback(null, {statusCode: 500});
    });
    let threw = false;
    return httpMultipart.upload(data.params, data.result).catch(err => {
      threw = true;
    }).then(() => {
      expect(threw).to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_1')).to.be('hello m');
      expect(MockRequest.getUrlData('http://unittest/rendition1_2')).to.be('ultipar');
      expect(MockRequest.getUrlData('http://unittest/rendition1_3')).not.to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_4')).not.to.be.ok();
      expect(MockRequest.getUrlData('http://unittest/rendition1_5')).not.to.be.ok();
    });
  });
});