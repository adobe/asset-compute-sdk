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

'use strict';

const expect = require('expect.js');
const process = require('../library').process;

const url = 'http://hostname/testfile.png';

// Worker function varifies that it is passed the url, not a file name 
function workerFn(infile) {
    console.log(`infile is ${infile}`);
    expect(infile).to.equal(url);
    return Promise.reject(Error("Terminate processing after worker function called"));
}

it('test process', function(done) {
    const params = {
      source: url
    };
    const options = {
       disableSourceDownloadSource: true
    };
    process(params, options, workerFn)
    .then(() => { done(Error('process should fail'))})
    .catch(() => { console.log('in catch as we should'); done(); })
});

