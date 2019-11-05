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

const fileUtils = require('./../../lib/utils/file-utils.js');

async function doRenditionHandlingAsync(infile, params, outdir, processingOptions) {
    const renditionResults = [];

    if (Array.isArray(params.renditions)) {
        let promise = Promise.resolve();

        // for each rendition to generate, create a promise that calls the actual rendition function passed
        const renditionPromiseFns = params.renditions.map(function (rendition, index) {
            return handleOneRendition(renditionResults, processingOptions, infile, rendition, outdir, params, index);
        });

        if (processingOptions.parallel) {
            // parallel execution
            promise = Promise.all(renditionPromiseFns.map(function(promiseFn) {
                return promiseFn();
            }));
        } else {
            // sequential execution
            for (let i=0; i < renditionPromiseFns.length; i++) {
                promise = promise.then(renditionPromiseFns[i]);
            }
        }
    }

    return Promise.resolve({renditions: renditionResults});
}

function handleOneRendition(renditionResults, processingOptions, infile, rendition, outdir, params, index) {
    // default rendition filename if not specified or whitespace
    if (!rendition.name || rendition.name.length === 0 || /^\s*$/.test(rendition.name)) {
        rendition.name = fileUtils.renditionFilename(rendition, infile, index);
    }

    // for sequential execution below it's critical to not start the promise executor yet,
    // so we collect functions that return promises
    return function() {
        return new Promise(function (resolve, reject) {
            try {
                const result = processingOptions.renditionFn(infile, rendition, outdir, params);

                // Non-promises/undefined instantly resolve
                return Promise.resolve(result)
                    .then(function(result) {
                        renditionResults.push(result);
                        return resolve();
                    })
                    // TODO: do not abort processing of remaining renditions?
                    .catch((e) => reject(e));

            } catch (e) {
                return reject(e.message);
            }
        });
    };
}


module.exports = {
    handleOneRendition,
    doRenditionHandlingAsync
}