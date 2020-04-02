/**
 *  ADOBE CONFIDENTIAL
 *  __________________
 *
 *  Copyright 2020 Adobe Systems Incorporated
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

const { actionWrapper } = require('@nui/asset-compute-commons');
const openwhisk = require('openwhisk');
const jsonwebtoken = require('jsonwebtoken');

function httpError(statusCode, message) {
    return {
        statusCode: statusCode,
        body: {
            message: message
        }
    };
}

function stripBearerPrefix(str) {
    const prefix = "Bearer ";
    if (str.startsWith(prefix)) {
        return str.substring(prefix.length);
    }
    return str;
}

function parseToken(token) {
    try {
        const jwt = jsonwebtoken.decode(token);

        if (jwt) {
            return jwt;
        } else {
            // if parsing fails, jsonwebtoken.decode() usually returns null
            throw new Error();
        }
    } catch (err) {
        throw httpError(500, "Invalid token");
    }
}

function getAuth(headers) {
    if (!headers.authorization) {
        throw httpError(401, "Missing Oauth token");
    }
    const token = stripBearerPrefix(headers.authorization);
    const jwt = parseToken(token);
    const orgId = headers["x-gw-ims-org-id"];
    const orgName = headers["x-gw-ims-org-name"];
    const appName = headers["x-app-name"];

    return {
        accessToken: token,
        clientId: jwt.client_id,
        appName,
        orgId,
        orgName
    };
}

function getParams(params) {
    const headers = params.__ow_headers;

    const requestId = headers["x-request-id"];
    const auth = getAuth(headers);

    params.metrics.add({
        clientId: auth.clientId,
        appName: auth.appName,
        orgId: auth.orgId,
        orgName: auth.orgName,
        requestId: requestId
    });

    return {
        source: params.source,
        renditions: params.renditions,
        userData: params.userData,
        requestId: requestId,
        auth: auth,
        newRelicEventsURL: params.newRelicEventsURL,
        newRelicApiKey: params.newRelicApiKey,
        times: params.times,
        customWorker: true
    };
}

async function invokeSelfAsync(params) {
    const actionName = process.env.__OW_ACTION_NAME;
    try {
        console.log(`Invoking ${actionName} asynchronously...`)
        const response = await openwhisk().actions.invoke({
            name: actionName,
            params: params
        });
        console.log(`Success, activation id: ${response.activationId}`);
        return response.activationId;

    } catch (e) {
        const msg = `Async invocation of ${actionName} failed with HTTP status code ${e.statusCode}`;
        console.error(msg, e);
        throw httpError(500, msg);
    }
}

function webaction(main) {
    // actionWrapper -> webaction -> main (worker)
    return actionWrapper(async (params={}) => {
        // if web action (custom worker), then invoke itself asynchronously
        if (params.__ow_method) {
            console.log(`Web action: HTTP ${params.__ow_method}`);

            // only POST requests are supported
            if (params.__ow_method !== "post") {
                // OPTIONS is handled by openwhisk
                throw httpError(405, "Supported HTTP methods: OPTIONS, POST");
            }

            const asyncParams = getParams(params);
            const activationId = await invokeSelfAsync(asyncParams);

            return {
                statusCode: 200,
                body: {
                    activationId
                }
            };
        }

        // otherwise proceed normally
        return main(params);
    });
}

module.exports = webaction;
