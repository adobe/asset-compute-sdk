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

const Source = require('./source');
const { AssetComputeLogUtils, GenericError } = require('@adobe/asset-compute-commons');
const http = require('./storage/http');
const datauri = require('./storage/datauri');
const URL = require('url');
const fs = require("fs-extra");
const path = require('path');
const mime = require('mime-types');
const validUrl = require('valid-url');
const url = require('url');

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
        return new Source(assetReference, directory, name);

    } else {
        const source = new Source(assetReference, directory, name);
        if (disableDownload) {
            console.log(`Skipping source file download for ${AssetComputeLogUtils.redactUrl(source.url)}`);
        } else {
            // TODO: error handling: errors catched & thrown in http.download() and then catched again in worker.js ???
            // download http/https url into file
            const protocol = URL.parse(assetReference.url).protocol;
            if (protocol === DATA_PROTOCOL) {
                await datauri.download(assetReference, source.path);
            } else {
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

async function putRendition(rendition) {
    // Note: validation has happened in validate.js before

    if (process.env.WORKER_TEST_MODE) {
        if(rendition.name.includes('post-')) {
            // to verify post-processing renditions, since their names contain `post-` in the beginning
            // and asset-compute-cli command run-worker only looks at the file named `rendition*.*`
            rendition.name = rendition.name.substring(5);
            
            const newPath = path.join(rendition.directory, rendition.name);
            await fs.rename( rendition.path, newPath);
            
            rendition.path = newPath;
        }
        
        // asset-compute-cli command run-worker wants file named as originally requested
        // however, computing the metadata wants the current path, so
        // we need to make a copy not just rename
        if (rendition.instructions.name) {
            const newPath = path.join(rendition.directory, rendition.instructions.name);
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
