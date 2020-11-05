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

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const FileType = require('file-type');
const contentType = require('content-type');

const DEFAULT_MIME_TYPE = 'application/octet-stream';

async function detectTypeUsingFileCommand(renditionPath) {
    const result = {};

    // assumes rendition exists and size > 0 (to be checked in caller)
    try {
        const { stdout } = await exec(`file -b --mime "${renditionPath}"`);

        // parsing will throw if `file` command did not return a valid content type
        const type = contentType.parse(stdout.trim());
        result.mime = type.type || DEFAULT_MIME_TYPE;

        if (type.parameters && type.parameters.charset) {
            result.encoding = type.parameters.charset;
        }

    } catch (e) {
        console.log(`Warning: executing 'file' to detect file type failed with: ${e.message}. code: ${e.code} signal: ${e.signal}`);
    }
    return result;
}

/**
 * Detects the mime type and encoding of a file by looking at its contents.
 *
 * @param {*} file file path
 * @returns {Object} object with `mime` and `encoding` fields
 */
async function detectContentType(file) {
    const result = await detectTypeUsingFileCommand(file);

    // if it failed or didn't find a specific type
    if (!result.mime || result.mime === DEFAULT_MIME_TYPE) {
        console.log('Falling back to `file-type` library');

        const fileTypeResult = await FileType.fromFile(file);
        // only defined if something could be identified
        if (fileTypeResult) {
            result.mime = fileTypeResult.mime;
        }
    }

    result.mime = result.mime || DEFAULT_MIME_TYPE;

    return result;
}

module.exports = detectContentType;
