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
const {remove} = require('./utils/file-utils');

// TODO: replaced by prepare.js cleanupDirectories()
async function cleanupFolders(inDirectory, outDirectory) {
    try {
        if (inDirectory) await remove(inDirectory);
        if (outDirectory) {
            await remove(outDirectory);
        }
    } catch(e) {
        console.error("error during cleanup:", e.message || e);
    }
}

function removeTimers(scheduledEvents) {
    for(let i = 0; i < scheduledEvents.length; i++){
        clearTimeout(scheduledEvents[i]);
    }
}

module.exports = {
    cleanupFolders,
    removeTimers
}