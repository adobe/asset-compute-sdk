/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2021 Adobe
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

const { v4: uuidv4 } = require("uuid");
const filesLib = require('@adobe/aio-lib-files'); // for temp cloud storage

/**
 * This class handles temporary cloud storage
 * This is a duplicate of asset-compute-pipeline temporary cloud storage,
 * but as per the existing practice duplicated into SDK and will be refactored
 * when we move to pipeline
 */
class TemporaryCloudStorage {
    async _init() {
        console.log("Using ootb storage for ('aio-lib-files')");
        this.aioLibFiles = await filesLib.init();
        console.log("Temporary cloud storage initialized ('aio-lib-files')");
    }

    /**
     * Create a presigned url (read, write, delete and combinations are supported)
     * @param {String} localFilePath local filesystem path to the file for which a presigned URL must be generated
     * @param {String} permissions permissions (`r` for read, `w` for write, `d` for delete and their combinations)
     * @param {Number} expiryInSeconds how long the generated presigned url will be valid
     * @returns {String} a presigned url
     */
    async generatePresignURL(cloudPath, permissions = "rwd", expiryInSeconds=3600){
        if(!this.aioLibFiles){
            await this._init();
        }

        const presignedUrlConfig = { permissions: permissions, expiryInSeconds: expiryInSeconds };
        const presignedUrl = await this.aioLibFiles.generatePresignURL(cloudPath, presignedUrlConfig);

        return presignedUrl;
    }

    /**
     * Create a unique name for cloud path
     * @param {String} filename (optional) filename a filename
     * @returns {String} a unique filename based on the entered filename
     */
    createUniqueName(filename="file.tmp"){
        return `${uuidv4()}/${Date.now()}/${filename}`;
    }

    /**
     * Upload a file from local filesystem to temporary cloud storage
     * @param {String} localFilePath local filesystem path to the file to upload
     * @param {String} cloudUniquePath cloud location path to upload to
     */
    async upload(localFilePath, cloudUniquePath){
        if(!this.aioLibFiles){
            await this._init();
        }

        console.log("Uploading from local filesystem to temporary cloud storage");
        await this.aioLibFiles.copy(localFilePath, cloudUniquePath, { localSrc: true }); //ensure cloud location exists
    }

    /**
     * Download a file from temporary cloud storage to local filesystem
     * @param {String} localFilePath local filesystem path to the file to download to
     * @param {String} cloudUniquePath cloud location path to upload to
     */
    async download(cloudUniquePath, localFilePath){
        if(!this.aioLibFiles){
            await this._init();
        }

        console.log("Downloading from temporary cloud storage to local filesystem");
        await this.aioLibFiles.copy(cloudUniquePath, localFilePath, { localDest: true });
    }

    /**
     * Removes files from temporary storage
     * @param {String} cloudUniquePath cloud location path to remove
     */
    async cleanUp(cloudUniquePath){
        if(!this.aioLibFiles){
            await this._init();
        }
        
        // await this.aioLibFiles.revokeAllPresignURLs(); // <- this would revoke all generated urls
        await this.aioLibFiles.delete(cloudUniquePath);
    }
}
module.exports = {
    TemporaryCloudStorage
};
 