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

'use strict';

const Asset = require('./asset');
const { AssetComputeLogUtils, GenericError, SourceUnsupportedError } = require('@adobe/asset-compute-commons');
const http = require('./storage/http');
const datauri = require('./storage/datauri');
const URL = require('url');
const fs = require("fs-extra");
const path = require('path');
const mime = require('mime-types');
const validUrl = require('valid-url');
const url = require('url');
const Rendition = require('./rendition');

const SOURCE_BASENAME = 'source';

const DATA_PROTOCOL = 'data:';

async function getAsset(assetReference, directory, name, disableDownload) {
    // normalize asset reference to be an object
    if(!assetReference) {
        throw new GenericError('Missing assetReference');
    }
    if (typeof assetReference === 'string') {
        assetReference = { url: assetReference };
    }

    if (process.env.WORKER_TEST_MODE) {
        // local file support for `Asset Compute test-worker` unit tests
        // not supported for clients in production
        // params.source.url will just be a filename like 'file.jpg'
        name = assetReference.url;
        const filePath = path.join(directory, name);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Invalid or missing local file ${name}`);
        }
        console.log("WORKER_TEST_MODE: asset path:", filePath);
        return new Asset(assetReference, directory, name);

    } else {
        const source = new Asset(assetReference, directory, name);
        if (disableDownload) {
            console.log(`Skipping source file download for ${AssetComputeLogUtils.redactUrl(source.url)}`);
            const protocol = URL.parse(assetReference.url).protocol;
            if (protocol === DATA_PROTOCOL) {
                await datauri.download(assetReference, source.path);
                if(!fileExistsAndIsNotEmpty(source.path)){
                    throw new SourceUnsupportedError(`Invalid or missing local file ${source.path}`);
                }
                const preSignedUrl = await datauri.getPreSignedUrl(source.path);
                console.log(`Uploaded data URI content to storage and generated presigned url`);
                const preSignedAssetReference = { url: preSignedUrl };
                return new Asset(preSignedAssetReference, directory, name);
            }   
        } else {
            // TODO: error handling: errors catched & thrown in http.download() and then catched again in worker.js ???
            // download http/https url into file
            const protocol = URL.parse(assetReference.url).protocol;
            if (protocol === DATA_PROTOCOL) {
                console.log("creating asset from data url:", source.path);
                await datauri.download(assetReference, source.path);
            } else {
                console.log("downloading asset:", source.path);
                await http.download(assetReference, source.path);
            }
        }

        return source;
    }
}

// function to return an extension for a file
// if not empty returns a leading period
// prefers extension from the file over name determined by mimeType
function extension(filename, mimeType) {
    let ext = '';
    if (filename) {
        ext = path.extname(filename);
    }
    if (!ext && mimeType) {
        const mimeExt = mime.extension(mimeType);
        ext = mimeExt ? `.${mimeExt}` : '';
    }
    return ext;
}

/**
 * Returns the time delta between two unix epoch timestamps in seconds
 *
 * @param {Number} path location of the file
 * @returns {Boolean} Returns false if file does not exist or is empty
 */
function fileExistsAndIsNotEmpty(path) {
    if(typeof path !== undefined && path && fs.existsSync(path)){
        const fileStats =  fs.statSync(path);
        if(fileStats.size !== 0){
            return true;
        }
    }
    return false;
}

// There is at least one worker (graphics magick) that in some cases depends
// upon the file extension so it is best to try to use the appropriate one
// based on the filename, url, or mimetype
function sourceFilename(source) {
    if (source.name) {
        return `${SOURCE_BASENAME}${extension(source.name, source.mimeType)}`;
    }

    if (source.url && validUrl.isUri(source.url)) {
        const basename = path.basename(url.parse(source.url).pathname);
        return  `${SOURCE_BASENAME}${extension(basename, source.mimeType)}`;
    }

    return `${SOURCE_BASENAME}${extension(null, source.mimeType)}`;
}

async function getSource(paramsSource, inDirectory, disableSourceDownload) {
    // normalize asset reference to be an object
    if (typeof paramsSource === 'string') {
        paramsSource = { url: paramsSource };
    }
    const name = sourceFilename(paramsSource);
    return getAsset(paramsSource, inDirectory, name, disableSourceDownload);
}

async function putRendition(rendition, directories) {
    // Note: validation has happened in validate.js before

    if (process.env.WORKER_TEST_MODE) {
        if (rendition.directory === directories.postprocessing) {
            // copy the post processing rendition to the rendition path as expected by "aio asset-compute test-worker"
            // but leave the rendition at its original path since worker.js still needs to read from it for metrics etc.
            const newRendition = new Rendition(rendition.instructions, directories.out, rendition.index);

            console.log(`WORKER_TEST_MODE: copying ${rendition.path} to ${newRendition.path}`);
            await fs.copy(rendition.path, newRendition.path);

            rendition = newRendition;
        }

        // asset-compute-cli command run-worker wants file named as originally requested through "name"
        // however, computing the metadata wants the current path, so we need to make a copy not just rename
        if (rendition.instructions.name) {
            const newPath = path.join(rendition.directory, rendition.instructions.name);

            console.log(`WORKER_TEST_MODE: copying ${rendition.path} to ${newPath}`);
            await fs.copyFile(rendition.path, newPath);
        }

    } else if (!rendition.shouldEmbedInIOEvent()) {
        await http.upload(rendition);
    }
}

module.exports = {
    getSource,
    putRendition,
    getAsset
};
