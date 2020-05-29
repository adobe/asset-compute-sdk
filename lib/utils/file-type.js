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

const fileType = require('file-type');

class FileTypeChecker {
    /**
     * Return extension and mimetype information
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @returns {Object} {ext: extension, mime: mime/type}, null if no guess
     */
    static async extractFileTypeFormat(filePath){
        return fileType.fromFile(filePath);
    }

    /**
     * Returns true if the file is of extension candidateType (case sensitive),
     * false if the file is not of extension type,
     * null if the assumption could not be verified
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @param {String} candidateType - Extension to validate
     * @returns {Boolean} (nullable)
     */
    static async verifyFileTypeFormat(filePath, candidateType){
        if(candidateType === 'svg') return null; // svg not supported for guessing
        const fileInfo = await FileTypeChecker.extractFileTypeFormat(filePath);
        return fileInfo ? fileInfo.ext === candidateType : null;
    }

    /**
     * Returns true if the file is of mime type candidateMime (case sensitive)
     * false if the file is not of mime type,
     * null if the assumption could not be verified
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @param {String} candidateMime - Mime type to validate
     * @returns {Boolean} (nullable)
     */
    static async verifyFileMimeType(filePath, candidateMime){
        if(candidateMime.includes('svg')) return null; // svg not supported for guessing
        const fileInfo = await FileTypeChecker.extractFileTypeFormat(filePath);
        return fileInfo ? fileInfo.mime === candidateMime : null;
    }
}

module.exports = FileTypeChecker;
