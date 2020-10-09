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

async function getContentTypeInformation(renditionPath) {
    let encoding;

    // assumes rendition exists and size > 0 (to be checked in caller)
    const { stdout } = await exec(`file -b --mime "${renditionPath}"`);
    const mimetype = stdout.trim();

    // parsing will throw if `file` command did not return a valid content type
    const parsedContentType = contentType.parse(mimetype);
    const mime = parsedContentType.type || DEFAULT_MIME_TYPE;

    if (parsedContentType.parameters && parsedContentType.parameters.charset) {
        encoding = parsedContentType.parameters.charset;
    }

    return { mime: mime, encoding: encoding };
}

/**
 * Detects the mime type and encoding of a file by looking at its contents.
 *
 * @param {*} file file path
 * @returns {Object} object with `mime` and `encoding` fields
 */
async function detectContentType(file) {
    let localMimeType;
    let localEncoding;

    try { // `file` command
        // assumes rendition exists and size > 0 (to be checked in caller)
        const fileCmdResult = await getContentTypeInformation(file);
        localMimeType = fileCmdResult.mime;
        localEncoding = fileCmdResult.encoding;
    } catch (err) { /* eslint-disable-line no-unused-vars */
        // fallback to using `file-type lib` (won't set encoding)
        console.log('Falling back to use `file-type` library');
        const filetypeInfo = await FileType.fromFile(file);
        if (filetypeInfo) { // only defined if something could be identified
            localMimeType = filetypeInfo.mime;
        }
    }

    return {
        mime: localMimeType || DEFAULT_MIME_TYPE,
        encoding: localEncoding
    };
}

module.exports = detectContentType;