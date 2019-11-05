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

const { GenericError } = require('@nui/asset-compute-commons');
const { actionName } = require('../action');

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

    if (params.renditions.length === 0) {
        throw new GenericError("'renditions' array is empty.", validateLocation);
    }

    params.renditions.forEach((rendition, index) => { validateRendition(rendition, index, validateLocation); });
}

function validateRendition(rendition, index, location){
    rendition.target = rendition.target || rendition.url;

    if (typeof rendition.target !== "string" && typeof rendition.target !== "object") {
        throw new GenericError(`rendition[${index}].target is neither a string nor an object`, location);
    }
}


module.exports = {
    validateParameters,
    validateRendition
}