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

const s3 = require('s3-client');

function getS3Download(params, context) {
    const source = params.source;

    return new Promise(function (resolve, reject) {
        // download file from s3
        context.s3Client = s3.createClient({
            s3Options: {
                region: source.s3Region,
                accessKeyId: source.accessKey,
                secretAccessKey: source.secretKey,
            },
        });

        const downloadParams = {
            localFile: context.infile,
            s3Params: {
                Bucket: source.s3Bucket,
                Key: source.s3Key
            }
        };

        context.s3Client
            .downloadFile(downloadParams)
            .on('error', function(err) {
                console.error("error s3 download", err);

                reject(`s3 download failed: ${err.message}`);
            })
            .on('end', function() {
                resolve(context);
            });
    });
}

function getS3Upload(params, result) {
    const { source, target } = params;

    return new Promise(function (resolve, reject) {

        target.s3Region  = target.s3Region || source.s3Region;
        target.s3Bucket  = target.s3Bucket || source.s3Bucket;
        target.accessKey = target.accessKey || source.accessKey;
        target.secretKey = target.secretKey || source.secretKey;

        if (!target.s3Region || !target.s3Bucket || !target.accessKey || !target.secretKey) {
            return reject("S3 target reference requires fields s3Region, s3Bucket, accessKey and secretKey.");
        }

        // check if target is a different location or different credentials
        if (!result.s3Client || target.s3Region !== source.s3Region || target.accessKey !== source.accessKey || target.secretKey !== source.secretKey) {
            result.s3Client = s3.createClient({
                s3Options: {
                    region: target.s3Region,
                    accessKeyId: target.accessKey,
                    secretAccessKey: target.secretKey,
                },
            });
        }

        const uploadParams = {
            localDir: result.outdir,
            followSymlinks: false,
            s3Params: {
                Bucket: target.s3Bucket,
                Prefix: target.s3Prefix || `${result.infilename}_renditions/`,
            },
        };

        console.log("START of s3 upload for ingestionId", params.ingestionId, "(all renditions)");

        result.s3Client.uploadDir(uploadParams)
            .on('error', function(err) {
                console.log("FAILURE of s3 upload for ingestionId", params.ingestionId, "(all renditions)");

                reject(`s3 upload of renditions failed: ${err.message}`);
            })
            .on('end', function() {
                console.log("END of s3 upload for ingestionId", params.ingestionId, "(all renditions)");

                resolve(result);
            });
    });
}

module.exports = {
    /** Return a promise for downloading the original file(s). */
    download: getS3Download,
    /** Return a promise for uploading the rendition(s). */
    upload: getS3Upload
};