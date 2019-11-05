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

const AssetComputeWorker = require('./lib/worker');
const { process, forEachRendition, shellScriptWorker } = require('./lib/compat');

function worker(renditionCallback) {
    if (typeof renditionCallback !== "function") {
        throw new Error("renditionCallback must be a function");
    }
    return function (params) {
        new AssetComputeWorker(params).compute(renditionCallback);
    }
}

function batchWorker(renditionsCallback) {
    if (typeof renditionsCallback !== "function") {
        throw new Error("renditionsCallback must be a function");
    }
    return function (params) {
        new AssetComputeWorker(params).computeAllAtOnce(renditionsCallback);
    }
}

/*

example code

exports.main = worker(async (source, rendition, outdir) => {
    // impl
});

exports.main = batchWorker(async (source, renditions, outdir) => {
    // impl
});

*/

// -----------------------< exports >-----------------------------------
module.exports = {
    worker,
    batchWorker,

    // backwards compatibility
    process, // for node.js workers
    forEachRendition, // for node.js workers, on top of process
    shellScriptWorker // all shellscript workers
}

