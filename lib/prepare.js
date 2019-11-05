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

const process = require('process');
const path = require('path');
const fs = require('fs-extra');

const { GenericError } = require('@nui/asset-compute-commons');

const WORK_DIRECTORY = "work";
const IN_DIRECTORY = "in";
const OUT_DIRECTORY = "out";

function actionName() {
    return process.env.__OW_ACTION_NAME.split('/').pop();
}

function validateParameters(params){
    const validateLocation = `${actionName()}_validate`;

    if (params.source === undefined || params.source === null) {
        throw new GenericError("No 'source' in params. Required for asset workers.", validateLocation);
    }
    if (typeof params.source === 'string') {
        params.source = { url: params.source };
    }

    if (! Array.isArray(params.renditions)) {
        throw new GenericError("'renditions' is not an array.", validateLocation);
    }

    params.renditions.forEach((rendition, index) => {
        rendition.target = rendition.target || rendition.url;

        if (typeof rendition.target !== "string" && typeof rendition.target !== "object") {
            throw new GenericError(`rendition[${index}].target is neither a string nor an object`, validateLocation);
        }
    });
}

async function createDirectories() {
    if (process.env.NUI_UNIT_TEST_MODE) {
        return {
            in: "/in",
            out: "/out"
        };
    }

    // all relative to current directory,
    // inside openwhisk nodejs container this would be:
    //
    //    /nodejsAction/xyz123

    // structure we create underneath the current dir:
    //
    //     work/
    //       <activationid>/   <- base
    //         in/             <- in
    //         out/            <- out

    const directories = {};
    directories.base = path.resolve(WORK_DIRECTORY, process.env.__OW_ACTIVATION_ID || '42');
    directories.in   = path.resolve(directories.base, IN_DIRECTORY);
    directories.out  = path.resolve(directories.base, OUT_DIRECTORY);

    console.log(`work directory        : ${directories.base}`);
    console.log(`- source directory    : ${directories.in}`);
    console.log(`- renditions directory: ${directories.out}`);

    // clean work directory if it might exist already
    await fs.remove(directories.base);

    await fs.mkdirs(directories.in);
    await fs.mkdirs(directories.out);

    return directories;
}

async function cleanupDirectories(directories) {
    if (directories && directories.base) {
        try {
            await fs.remove(directories.base);
        } catch (err) {
            console.error(`Error while cleaning up work directories: ${err.message || err}`);
        }
    }
}

module.exports = {
    actionName,
    validateParameters,
    createDirectories,
    cleanupDirectories
}