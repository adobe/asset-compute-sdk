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
     * @returns {Object} {ext: extension, mime: mime/type}, null if no guess
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
     * Guesses extension and mimetype information, does not check that file has minimum
     * size to have a trustable guess (aka some files still may be misidentified)
     *
     * @param {String} filePath - Path of the file to analyze on-drive
     * @returns {Object} {ext: extension, mime: mime/type}, null if no guess
     */
    static async guessTypeFormat(filePath){
        // verify the file is large enough
        let readSize = fileType.minimumBytes;
        const fileStat = await fs.stat(filePath);
        if(fileStat.size < fileType.minimumBytes) readSize = fileStat.size;

        // get the info
        const buffer = await readChunk(filePath, 0, readSize);
        const fileInfo = fileType(buffer);
        return fileInfo;
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
    static async verifyTypeFormat(filePath, candidateType){
        if(candidateType === 'svg') return null; // svg not supported for guessing
        const fileInfo = await FileTypeChecker.extractTypeFormat(filePath);
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
    static async verifyMimeType(filePath, candidateMime){
        if(candidateMime.includes('svg')) return null; // svg not supported for guessing
        const fileInfo = await FileTypeChecker.extractTypeFormat(filePath);
        return fileInfo ? fileInfo.mime === candidateMime : null;
    }
}

module.exports = FileTypeChecker;