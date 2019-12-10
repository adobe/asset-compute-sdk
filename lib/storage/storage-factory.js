/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2018 Adobe Systems Incorporated
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

const URL = require('url');

const httpStorage = require('./http');
const dataStorage = require('./datauri');

const DATA_PROTOCOL = 'data:';

function getDownload(source) {
    const protocol = URL.parse(source.url).protocol;

    if (protocol === DATA_PROTOCOL) {
        return dataStorage.download;
    } else {
        return httpStorage.download;
    }
}

module.exports = {
    getDownload
};
