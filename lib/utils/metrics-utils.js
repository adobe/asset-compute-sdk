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

const process = require('process');
const cgroup = require('cgroup-metrics');

const { AssetComputeMetrics, Reason } = require('@nui/asset-compute-commons');

const timer = require('./timer');

const METRIC_FETCH_INTERVAL_MS = 100;

function scheduleTimeoutMetrics(metrics, timers) {
    const timeTillTimeout = process.env.__OW_DEADLINE - Date.now() || METRIC_FETCH_INTERVAL_MS;
    return setTimeout(
        async () => {
            console.log(`${process.env.__OW_ACTION_NAME} will timeout in ${timeTillTimeout} milliseconds. Sending metrics before action timeout.`);
            if (!(metrics.duration))  { metrics.duration =  parseFloat(timer.timer_elapsed_seconds(timers.duration)); } // set duration metrics if not already set
            await (new AssetComputeMetrics).sendMetrics("timeout", metrics);
            console.log(`Metrics sent before action timeout.`);
        }, 
        timeTillTimeout - METRIC_FETCH_INTERVAL_MS
    ); 
}

function scheduleOSMetrics(metrics) {
    function scheduleOSMetricsCollection() {
        return setTimeout(updateMemoryMetrics, METRIC_FETCH_INTERVAL_MS);
    }
    
    async function updateMemoryMetrics() {
        // currently it just stores the max of each metric
        // this will change once node-newrelic-serverless is integrated
        try {
            const metrics_object = await cgroup.metrics(true);
            const keys = Object.keys(metrics_object);
            for (let met in keys) {
                met = keys[met];
                const current_metric = metrics_object[met];

                // cpuacct.usage_percpu is an Array
                if (typeof(current_metric) == "object") {
                    if (metrics[met]) {
                        for (const i in current_metric) {
                            if (!metrics[met][i] || (current_metric[i] > metrics[met][i])) {
                                metrics[met][i] = current_metric[i];
                            }
                        }

                    } else {
                        metrics[met] = current_metric;
                    }
                } else {
                    if (!metrics[met] || (current_metric > metrics[met])) {
                        metrics[met] = current_metric;
                    }
                }
            }

        } catch (e) {
            // this is expected to fail in testing environment
        }

        return scheduleOSMetricsCollection();  
    }

    return scheduleOSMetricsCollection();  
}

function sendRenditionMetrics(rendition, params, context, metrics, events){
    // check if successfully created
    if (context.renditions[rendition.name]) {
        const eventPayload = { rendition: rendition, metadata: context.renditions[rendition.name] };
        const metricsPayload = Object.assign(metrics, rendition);
        return events.sendRenditionEventAsync(eventPayload, metricsPayload);
    } else {
        // TODO: add error details - requires some refactoring
        // - file too large for multipart upload, include actual rendition size
        // - mime type wrong
        const error = {
            eventType: "error",
            reason: Reason.GenericError,
            message:`No rendition found for ${rendition.name}`,
            location:"uploading_error",
            rendition: rendition
        };
        return events.sendErrorEventAsync(error, metrics);
    }
}

module.exports = {
    scheduleTimeoutMetrics,
    scheduleOSMetrics,
    sendRenditionMetrics
}