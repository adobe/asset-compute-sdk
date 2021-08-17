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

const dataUriToBuffer = require('data-uri-to-buffer');
const fsPromises = require('fs').promises;
const { GenericError } = require('@adobe/asset-compute-commons');
const { actionName } = require('../action');
const { TemporaryCloudStorage } = require('./temporary-cloud-storage');

async function download(source, file) {    
    try {
        const decoded = dataUriToBuffer(source.url);
        console.log(`downloading source data uri into ${file}`);

        await fsPromises.writeFile(file, decoded);
    } catch (err) {
        throw new GenericError(err.message, `${actionName()}_download`);
    }
}
/**
 * Generate Presign Url taking local file path as input
 * Creates a unqiue name for the file, upload the file to 
 * storage from the path provided and generates a PreSigned Url
 * @param {String} Path to local file system, where file is available
 * @returns {String} PreSigned Url of upload the source file
 */
async function getPreSignedUrl(source) {
    /**
     * if is local file, upload to cloud storage and return signed URL
     */
    const temporaryCloudStorage = new TemporaryCloudStorage();
    // Create temp file name,
    const path = temporaryCloudStorage.createUniqueName();
    // Upload
    await temporaryCloudStorage.upload(source, path);
    console.log(`${source} file is uploaded to storage`);
    // Presign url
    const presignUrl = temporaryCloudStorage.generatePresignURL(path, "r");
    console.log(`Generated PreSigned Url for ${source}`);
    return presignUrl;
}
module.exports = {
    download,
    getPreSignedUrl
};
