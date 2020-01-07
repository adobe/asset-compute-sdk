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