/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2019 Adobe Systems Incorporated
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

const readChunk = require('read-chunk');
const fileType = require('file-type');
const fs = require('fs').promises;

class FileTypeChecker {
    /**
     * Return extension and mimetype information
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @returns {Object} {ext: extension, mime: mime/type}
     */
    static async extractTypeFormat(filePath){
        // verify the file is large enough
        const fileStat = await fs.stat(filePath);
        if(fileStat.size < fileType.minimumBytes) return null;

        // get the info
        const buffer = await readChunk(filePath, 0, fileType.minimumBytes);
        const fileInfo = fileType(buffer);
        return fileInfo;
    }

    /**
     * Returns true if the file is of extension candidateType (case sensitive),
     * false if the file is not of extension type,
     * null if the file is to small to verify
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @param {String} candidateType - Extension to validate
     * @returns {Boolean}
     */
    static async verifyTypeFormat(filePath, candidateType){
        const fileInfo = await FileTypeChecker.extractTypeFormat(filePath);
        return fileInfo ? fileInfo.ext === candidateType : null;
    }

    /**
     * Returns true if the file is of mime type candidateMime (case sensitive)
     * false if the file is not of mime type,
     * null if the file is to small to verify
     * 
     * @param {String} filePath - Path of the file to analyze on-drive
     * @param {String} candidateMime - Mime type to validate
     * @returns {Boolean}
     */
    static async verifyMimeType(filePath, candidateMime){
        const fileInfo = await FileTypeChecker.extractTypeFormat(filePath);
        return fileInfo ? fileInfo.mime === candidateMime : null;
    }
}

module.exports = FileTypeChecker;