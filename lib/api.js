/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2019 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

'use strict';

const AssetComputeWorker = require('./worker');
// const { ShellScriptWorker } = require('./shell/shellscript');

/**
 * Worker where the renditionCallback is called for each rendition.
 *
 * @param {*} renditionCallback callback called for each rendition, must convert source into rendition
 *                              signature: (source, rendition)
 *                              required
 * @param {*} options optional options
 */
function worker(renditionCallback, options={}) {
    if (typeof renditionCallback !== "function") {
        throw new Error("renditionCallback must be a function");
    }

    return function (params) {
        return new AssetComputeWorker(params, options).compute(renditionCallback);
    }
}

/**
 * Worker where the renditionsCallback is called once with all renditions.
 *
 * @param {*} renditionsCallback callback called with all rendition, must convert source into all renditions
 *                               signature: (source, renditions)
 *                               required
 * @param {*} options optional options
 */
function batchWorker(renditionsCallback, options={}) {
    if (typeof renditionsCallback !== "function") {
        throw new Error("renditionsCallback must be a function");
    }

    return function (params) {
        return new AssetComputeWorker(params, options).computeAllAtOnce(renditionsCallback);
    }
}

function bashScriptWorker() {
    throw new Error("bashScriptWorker implemented yet");
}

module.exports = {
    worker,
    batchWorker,
    bashScriptWorker
}