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

// place for small file utilities. larger parts should move into their own module.
const fs = require('fs-extra');

/**
 * Returns the time delta between two unix epoch timestamps in seconds
 *
 * @param {Number} path location of the file
 * @returns {Boolean} Returns false if file does not exist or is empty
 */
function fileExistsAndIsNotEmpty(path) {
    if(typeof path !== undefined && path && fs.existsSync(path)){
        const fileStats =  fs.statSync(path);
        if(fileStats.size !== 0){
            return true;
        }
    }
    return false;
}

module.exports = {
    fileExistsAndIsNotEmpty
};