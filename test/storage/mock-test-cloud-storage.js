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

'use strict';

const { v4: uuidv4 } = require("uuid");

/**
 * This class handles temporary cloud storage
 * This is a duplicate of asset-compute-pipeline temporary cloud storage,
 * but as per the existing practice duplicated into SDK and will be refactored
 * when we move to pipeline
 */
class TemporaryCloudStorage {
    constructor(){
        this.localFilePath = `fakeSourceLocalPath`;
        this.cloudUniquePath = `fakeCloudPath`;
        this.preSignUrl  = `http://storage.com/preSignUrl/`;
    }
    async _init() {
        console.log("Using mock storage for ('aio-lib-files')");
        this.aioLibFiles = true;
    }

    /**
     * Create a presigned url (read, write, delete and combinations are supported)
     * @param {String} localFilePath local filesystem path to the file for which a presigned URL must be generated
     * @param {Number} attempt the retry attempt 
     * @param {String} permissions permissions (`r` for read, `w` for write, `d` for delete and their combinations)
     * @param {Number} expiryInSeconds how long the generated presigned url will be valid
     * @returns {String} a presigned url
     */
    async generatePresignURL(cloudPath, attempt, permissions = "rwd", expiryInSeconds=3600){
        if(!this.aioLibFiles){
            await this._init();
        }
        console.log(`Mock presignedUrl create  attempt ${attempt}, 
        locationFilePath ${this.localFilePath}, permissions ${permissions}, expiry ${expiryInSeconds}` );
        if(this.localFilePath==='fakeSuccessFilePath'){
            this.preSignUrl += this.localFilePath;
            return this.preSignUrl;
        }
        if(attempt === 3 && this.localFilePath==='fakeRetrySuccessFilePath'){
            this.preSignUrl += this.localFilePath;
            return this.preSignUrl;
        }
        
        throw Error(`Mock PresignUrl generation error ${this.localFilePath}`);
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
        this.localFilePath = localFilePath;
        this.cloudUniquePath = cloudUniquePath;
        console.log(`Mock file uploaded ${localFilePath}`);
        return {localFilePath : cloudUniquePath};
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
        this.localFilePath = localFilePath;
        this.cloudUniquePath = cloudUniquePath;
        console.log(`Downloading from mock cloud storage to local filesystem ${localFilePath}`);
        return { localFilePath : cloudUniquePath };
    }

    /**
     * Removes files from temporary storage
     * @param {String} cloudUniquePath cloud location path to remove
     */
    async cleanUp(cloudUniquePath){
        if(!this.aioLibFiles){
            await this._init();
        }
        console.log("Deleting from mock cloud storage");
        this.cloudUniquePath = ``;
        return cloudUniquePath;
    }
}
module.exports = {
    TemporaryCloudStorage
};
 