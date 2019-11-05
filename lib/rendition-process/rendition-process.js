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

/** TODO: This is going to be turned into a class! */
// Turn this into a state machine?
const path = require('path');
const sizeOf = require('image-size');

const fileUtils = require('./../../lib/utils/file-utils');
const http = require('./../../lib/storage/http');
const local = require('./../../lib/storage/local');

const { GenericError } = require('@nui/asset-compute-commons');


async function collectRenditionFiles(context){
    context.renditions = {};
    let count = 0;
    
    const files = await fileUtils.readdir(context.outdir);
            
    files.forEach(f => {
        const file = path.join(context.outdir, f);
        const stat = fileUtils.statSync(file)
        if (stat.isFile()) {
            console.log("- rendition found:", f);
            context.renditions[f] = {};
            context.renditions[f]['repo:size'] = stat.size;
            try {
                const dimensions = sizeOf(file);
                context.renditions[f]['tiff:ImageWidth'] = dimensions.width;
                context.renditions[f]['tiff:ImageHeight'] = dimensions.height;
            } catch (err) {
                // The rendition may or may not be an image, so log error for informational purposes
                console.log(`No dimensions found for file ${f}`, err.message || err);
            }
            count += 1;
        }
    });

    return count;
}

async function uploadRenditionFiles(params, context){
    if (context.isLocalFile) {
        await local.upload(params, context);
    } else {
        await http.upload(params, context);
    }
}

async function executeWorker(infile, params, outdir, processingOptions, workerFnAsync){
    if(typeof workerFnAsync !== "function"){
        throw new GenericError("Worker cannot be executed", "worker_execution");
    }

    return workerFnAsync(infile, params, outdir, processingOptions);
}

module.exports = {
    executeWorker,
    collectRenditionFiles,
    uploadRenditionFiles
}