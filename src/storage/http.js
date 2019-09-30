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

// const request = require('request');
const fetch = require('fetch-retry')
const mime = require('mime-types');
const path = require('path');
const fs = require('fs-extra');
const { GenericError } = require ('../../errors.js');

const DEFAULT_MS_TO_WAIT = 100;
const DEFAULT_MAX_SECONDS_TO_TRY = 60;
const BUFFER = 500 // buffer time for download maxSeconds since nui will still need time to process the asset

async function readErrorMessage(file) {
    return new Promise( (resolve, reject) => {
        const maxSize = 10000;
        const stats = fs.statSync(file);
        let msg = ""
        fs.createReadStream(file, { start: 0, end: Math.min(stats.size, maxSize) })
            .on("data", s => msg += s)
            .on("close", () => {
                if (stats.size > maxSize) {
                    msg += "..."
                }
                resolve(msg)
            })
            .on("error", error => {
                reject(error)
            })

    });
}


async function getHttpDownload(params, context) {
    try {
        const file = fs.createWriteStream(context.infile);

        const startTime = Date.now();
        const maxSeconds = ( (process.env.__OW_DEADLINE - startTime - BUFFER) / 1000  )|| DEFAULT_MAX_SECONDS_TO_TRY;
        let retryIntervalMillis = DEFAULT_MS_TO_WAIT;

        const retryOptions = {
            retryOn: function(attempt, error, response) {
                const secondsWaited = ( Date.now() - startTime) / 1000.0;
                if ((secondsWaited < maxSeconds) && (error !== null || ( response.status >= 400 ))) {
                    const msg = `Retrying after attempt number ${attempt+1} and waiting ${secondsWaited} seconds to download file ${context.infilename} failed: ${error || (response.status)}`;
                    console.error(msg);
                    return true;
                }
                return false;
            },
            retryDelay: () => (retryIntervalMillis *= 2)
        }

        const response = await fetch(params.source.url, retryOptions);
        if (response.status >= 300) {
            const contentType = response.headers._headers["content-type"]
            if (contentType && contentType.startsWith("text/")) {
                const body = await readErrorMessage(context.infile);
                fs.unlink(context.infile);
                console.error("download failed with", response.status);
                console.error(body);
                throw Error(`HTTP GET download of source ${context.infilename} failed with ${response.status}. Body: ${body}`);
            } else {
                throw Error(`HTTP GET download of source ${context.infilename} failed with ${response.status}.`);
            }
        }
        return new Promise((resolve, reject) => {
            file.on("error", err => {
                fs.unlink(context.infile); // Delete the file async. (But we don't check the result)
                console.error("download failed", err);
                reject(`HTTP GET download of source ${context.infilename} failed with ${err}`);
            })
            file.on('finish', () => {
                resolve(context);
            })
            response.body.pipe(file);
        })


    } catch (e) {
        console.log(`download error: ${e}`);
        throw new GenericError(e.message || e, "download_error");
    }
}

async function getHttpUpload(params, result) {

    for await (const rendition of params.renditions) {
        try {
            if (result.renditions[rendition.name]) {

                // ...upload it via PUT to the url
                console.log("START of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                console.log("uploading", rendition.name, "to", rendition.url);

                const file = path.join(result.outdir, rendition.name);
                const filesize = fs.statSync(file).size;


                const startTime = Date.now();
                const maxSeconds = ((process.env.__OW_DEADLINE - startTime) / 1000 )|| DEFAULT_MAX_SECONDS_TO_TRY;
                let retryIntervalMillis = DEFAULT_MS_TO_WAIT;

                const retryOptions = {
                    retryOn: function(attempt, error, response) {
                        const secondsWaited = ( Date.now() - startTime) / 1000.0;
                        if ((secondsWaited < maxSeconds) && (error !== null || ( response.status >= 400 ))) {
                            const msg = `Retrying after attempt number ${attempt+1} and waiting ${secondsWaited} seconds to download file ${rendition.name} failed: ${error || (response.status)}`;
                            console.error(msg);
                            return true;
                        }
                        return false;
                    },
                    retryDelay: () => (retryIntervalMillis *= 2)
                }

                const response = await fetch(rendition.target || rendition.url, Object.assign( {
                    method: "PUT",
                    headers: {
                        "Content-Type": rendition.mimeType || mime.lookup(rendition.name) || 'application/octet-stream'
                        },
                    body: filesize === 0 ? "" : fs.readFileSync(file)
                    }, retryOptions))

                let body = "undefined";
                try {
                    body = await response.json(); // body may be empty
                } catch (e) {
                    console.log("Body is empty");
                }
                return new Promise(function (resolve, reject) {
                    if (response.statusCode >= 300) {
                        console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                        console.error("upload failed with", response.status);
                        console.error(body);
                        reject(`HTTP PUT upload of rendition ${rendition.name} failed with ${response.status}. Body: ${body}`);
                    } else {
                        console.log("END of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                        resolve(result);
                    }
                });
            }

        } catch (e) {
                console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                console.error("upload failed", e);
                throw new GenericError(e.message || e, "upload_error");
            }

        }
        return result;
    }

module.exports = {
    /** Return a promise for downloading the original file(s). */
    download: getHttpDownload,
    /** Return a promise for uploading the rendition(s). */
    upload: getHttpUpload
};