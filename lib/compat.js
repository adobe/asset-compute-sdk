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

const clone = require('clone');
const AssetComputeWorker = require('./worker');

// bridge new to old rendition object passed to callback
function mapRendition(rendition) {
    return Object.assign(
        clone(rendition.instructions),
        {
            name: rendition.name
        }
    );
}

function process(params, options, workerFn) {
    if (typeof options === "function") {
        workerFn = options;
        options = {};
    }

    const worker = new AssetComputeWorker(params, options);

    return worker.computeAllAtOnce((source, renditions, outDirectory) => {
        return workerFn(source.path, renditions.map(mapRendition), outDirectory);
    });
}

function forEachRendition(params, options, workerFn) {
    if (typeof options === "function") {
        workerFn = options;
        options = {};
    }

    const worker = new AssetComputeWorker(params, options);

    return worker.compute((source, rendition) => {
        return workerFn(source.path, mapRendition(rendition), rendition.directory);
    });
}

function shellScriptWorker() {
    // TODO: implement bridge
}

module.exports = {
    process,
    forEachRendition,
    shellScriptWorker
};