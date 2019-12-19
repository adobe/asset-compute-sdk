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

class FileTypeChecker {
    // filepath should be the path on a file on-drive
    static async extractTypeFormat(filePath){
        const buffer = await readChunk(filePath, 0, fileType.minimumBytes);
        const fileInfo = fileType(buffer);
        return fileInfo;
    }
}

module.exports = FileTypeChecker;