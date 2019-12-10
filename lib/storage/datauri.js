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

const dataUriToBuffer = require('data-uri-to-buffer');
const fsPromises = require('fs').promises;
const { GenericError } = require('@nui/asset-compute-commons');
const { actionName } = require('../action');

async function download(source, file) {
    try {
        const decoded = dataUriToBuffer(source.url);
        console.log(`downloading source data uri into ${file}`);

        await fsPromises.writeFile(file, decoded);
    } catch (err) {
        throw new GenericError(err.message, `${actionName()}_download`);
    }
}

module.exports = {
    download
};
