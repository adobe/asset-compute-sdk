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

const request = require('request');
const mime = require('mime-types');
const path = require('path');
const fs = require('fs-extra');

function getHttpDownload(params, context) {
    return new Promise(function(resolve, reject) {

        const file = fs.createWriteStream(context.infile);

        request.get(params.source.url, function(err, response, body) {
            if (err) {
                fs.unlink(context.infile); // Delete the file async. (But we don't check the result)
                console.error("download failed", err);
                reject(`HTTP GET download of source ${context.infilename} failed with ${err}`);
            } else if (response.statusCode >= 300) {
                fs.unlink(context.infile); // Delete the file async. (But we don't check the result)
                console.error("download failed with", response.statusCode);
                console.error(body);
                reject(`HTTP GET download of source ${context.infilename} failed with ${response.statusCode}. Body: ${body}`);
            } else {
                console.log("done downloading", context.infilename);
                file.close(function() {
                    resolve(context);
                });
            }
        }).pipe(file);
    });
}

function getHttpUpload(params, result) {
    return Promise.all(params.renditions.map(function (rendition) {
        // if the rendition was generated...
        if (result.renditions[rendition.name]) {
            return new Promise(function (resolve, reject) {
                // ...upload it via PUT to the url
                console.log("START of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                console.log("uploading", rendition.name, "to", rendition.url);

                const file = path.join(result.outdir, rendition.name);
                const filesize = fs.statSync(file).size;
                request({
                    url: rendition.url,
                    method: "PUT",
                    headers: {
                        "Content-Type": rendition.mimeType || mime.lookup(rendition.name) || 'application/octet-stream'
                    },
                    // not using pipe() here as that leads to chunked transfer encoding which S3 does not support
                    body: filesize === 0 ? "" : fs.readFileSync(file)
                }, function(err, response, body) {
                    if (err) {
                        console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                        console.error("upload failed", err);
                        reject(`HTTP PUT upload of rendition ${rendition.name} failed with ${err}`);
                    } else if (response.statusCode >= 300) {
                        console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                        console.error("upload failed with", response.statusCode);
                        console.error(body);
                        reject(`HTTP PUT upload of rendition ${rendition.name} failed with ${response.statusCode}. Body: ${body}`);
                    } else {
                        console.log("END of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                        resolve(result);
                    }
                });
            });
        }
        return Promise.resolve({});
    }));
}

module.exports = {
    /** Return a promise for downloading the original file(s). */
    download: getHttpDownload,
    /** Return a promise for uploading the rendition(s). */
    upload: getHttpUpload
};