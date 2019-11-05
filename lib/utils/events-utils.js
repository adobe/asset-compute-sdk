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

const { AssetComputeMetrics, AssetComputeEvents, Reason } = require('@nui/asset-compute-commons');

const RENDITION_EVENT = "rendition";
const RENDITION_FAILED_EVENT = "rendition_failed";

function getEventHandler(params, assetComputeEventSender, assetComputeMetrics) {
    if(assetComputeEventSender === null) assetComputeEventSender = new AssetComputeEvents(params);
    if(assetComputeMetrics === null) assetComputeMetrics = new AssetComputeMetrics(params);

    return {
        sendRenditionEventAsync: async function(payload, metrics) {
            // does this have an order?
            await assetComputeEventSender.sendEvent(RENDITION_EVENT, payload);
            await assetComputeMetrics.sendMetrics(RENDITION_EVENT, metrics);

            // if no order:
            // let promises = [];
            // promises.push(assetComputeEventSender.sendEvent(RENDITION_EVENT, payload));
            // promises.push(await assetComputeMetrics.sendMetrics(RENDITION_EVENT, metrics));
            // await Promise.all(promises);
        },
        sendErrorEventAsync: async function(error, metrics) {
            await assetComputeEventSender.sendEvent(RENDITION_FAILED_EVENT, error);
            await assetComputeMetrics.sendErrorMetrics(error.location, error.message, metrics);
        }
    };
}

function sendError(params, error, metrics, defaultErrorMessage){
    const events = getEventHandler(params);
    params.renditions.forEach(rendition => {
        const errorPayload = { 
            rendition,
            errorReason: error.name || Reason.GenericError,
            errorMessage: error.message || error
        };
        const metricsPayload = Object.assign( metrics || {} , {
            eventType: RENDITION_FAILED_EVENT,
            reason: error.reason || Reason.GenericError,
            message: error.message || error,
            location: error.location || defaultErrorMessage
        });
        events.sendErrorEventAsync(errorPayload, metricsPayload);
    });
}

module.exports = {
    getEventHandler,
    sendError
}