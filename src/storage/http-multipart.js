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

const path = require('path');
const http = require('@nui/node-httptransfer');
const httpStorage = require('./http');

function getHttpDownload(params, context) {
  // for now, use single download
  return httpStorage.download(params, context);
}

/**
 * "Splits" the source file into equal chunks based on the number of upload URLs provided, and PUTs each chunk to the
 * URLs.
 *
 * @param {Object} params Parameters passed to the nui process.
 * @param {Array} params.renditions List of renditions to be processed by the multipart upload. It's expected that
 *  each rendition object contain at least the following elements:
 *    name (string): The name of the rendition, which will be used to construct the local path of the file to upload.
 *    target (Object): Information about where the rendition will be uploaded.
 *      type (string): Should be "http-multipart" in order to trigger the multipart upload process.
 *      minPartSize (number): The minimum size of a single part that will be accepted by the target endpoint.
 *      maxPartSize (number): The maximum size of a single part that will be accepted by the target endpoint.
 *      urls (Array): List of URLs to which the target rendition will be uploaded in parts.
 * @param {Object} result Information about the output of the nui process.
 * @param {string} result.outdir Will be used, along with each rendition's name, to construct the local path to each
 *  file to upload.
 * @returns {Promise} Completion of this promise indicates that all renditions have been uploaded.
 */


async function getHttpUpload(params, result) {
  for (const rendition of params.renditions) {
    if (result.renditions[rendition.name]) {
      // ...upload it via PUT to the url
      console.log("START of multipart upload for ingestionId", params.ingestionId, "rendition", rendition.name);
      console.log("uploading", rendition.name);

      // Protect against it not being specified as a multi part upload
      const file = path.join(result.outdir, rendition.name);
      const target = rendition.target || rendition.url;

      if (typeof target === 'string') {
        await http.uploadFile(file, target);
      } else if (typeof target === 'object') {
        await http.uploadMultipartFile(file, target);
      } else {
        throw new Error('target is neither a string nor an object');
      }
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
