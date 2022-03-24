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

const { actionWrapper } = require('@adobe/asset-compute-commons');
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
    } catch (err) { /* eslint-disable-line no-unused-vars */
        throw httpError(401, "Invalid token");
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
        customWorker: true,
        predictedRunDuration: params.predictedRunDuration
    };
}

async function invokeSelfAsync(params) {
    const actionName = process.env.__OW_ACTION_NAME;
    try {
        console.log(`Invoking ${actionName} asynchronously...`);
        const response = await openwhisk().actions.invoke({
            name: actionName,
            params: params
        });
        console.log(`Success, activation id: ${response.activationId}`);
        return response.activationId;

    } catch (e) {
        const msg = `Async invocation of ${actionName} failed with HTTP status code ${e.statusCode}`;
        console.log(msg, e);
        const code = e.statusCode === 429 ? 429 : 500;
        throw httpError(code, msg);
    }
}

function webaction(main) {
    console.log('ASSETS-359 PR code running');
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
