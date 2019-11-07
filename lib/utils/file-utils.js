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

// const path = require('path');
const fs = require('fs-extra');
// const mime = require('mime-types');
// const urlUtils = require('./url-utils');

// const SOURCE_BASENAME = 'source';

// function to return an extension for a file
// if not empty returns a leading period
// prefers extension from the file over name determined by mimeType
// function extension(filename, mimeType) {
//     let ext = '';
//     if (filename) {
//         ext = path.extname(filename);
//     }
//     if (!ext && mimeType) {
//         const mimeExt = mime.extension(mimeType);
//         ext = mimeExt ? `.${mimeExt}` : '';
//     }
//     return ext;
// }

// There is at least one worker (graphics magick) that in some cases depends
// upon the file extension so it is best to try to use the appropriate one
// based on the filename, url, or mimetype
// function sourceFilename(source) {
//     if (source.name) {
//         return `${SOURCE_BASENAME}${extension(source.name, source.mimeType)}`;
//     }

//     if (typeof source === 'string') {
//         source = { url: source };
//     }

//     if (source.url && urlUtils.isUri(source.url)) {
//         const basename = path.basename(urlUtils.parse(source.url).pathname);
//         return  `${SOURCE_BASENAME}${extension(basename, source.mimeType)}`;
//     }

//     return `${SOURCE_BASENAME}${extension(null, source.mimeType)}`;
// }

// Function to isolate to ease testing
async function remove(path){
    return fs.remove(path);
}

async function mkdirs(path){
    return fs.mkdirs(path);
}

function statSync(path){
    return fs.statSync(path);
}

async function stat(path){
    return fs.stat(path);
}

function readdir(path){
    return fs.readdir(path);
}

function exists(path){
    return fs.exists(path);
}

function existsSync(path){
    return fs.existsSync(path);
}

function readFileSync(path){
    return fs.readFileSync(path);
}

function removeSync(path){
    return fs.removeSync(path);
}

function mkdirsSync(path){
    return fs.mkdirsSync(path);
}


module.exports = {
    // sourceFilename,
    remove,
    mkdirs,
    statSync,
    stat,
    readdir,
    exists,
    existsSync,
    readFileSync,
    removeSync,
    mkdirsSync
}