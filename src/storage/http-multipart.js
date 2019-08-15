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

const rp = require('request-promise-native');
const path = require('path');
const fs = require('fs-extra');
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

      const file = path.join(result.outdir, rendition.name);
      const stat = await fs.stat(file);
      const filesize = stat.size;

      // ensure expected information was provided
      const {target={}} = rendition;
      const {minPartSize=0, maxPartSize=-1, urls=[]} = target;
      console.log(`multipart upload min part size of ${minPartSize}, max part size of ${maxPartSize}, url count: ${urls.length}`);
      if (maxPartSize === 0) {
        throw 'maxPartSize for a rendition must be specified and not equal to 0';
      }

      // ensure there are enough URLs
      if (maxPartSize > 0) {
        const numParts = Math.ceil(filesize / maxPartSize);
        if (numParts > urls.length) {
          throw `number of parts (${numParts}) is more than the number of available part urls (${urls.length})`;
        }
      }

      let partSize;

      // if file size is less than minimum part size, use the file's size
      if (filesize < minPartSize) {
        partSize = filesize;
        if (urls.length !== 1) {
          throw `filesize less than min part size must only have one url`;
        }
      } else {
        // calculate part size based on number of urls
        partSize = Math.floor((filesize + urls.length - 1) / urls.length);

        if (partSize < minPartSize) {
          throw `calculated part size ${partSize} is less than min part size ${minPartSize}`;
        }
      }

      console.log(`multipart upload part size is ${partSize}`);

      for (const [index, uri] of urls.entries()) {
        const start = index * partSize;
        let end = start + partSize - 1;
        if (end > filesize - 1) {
          end = filesize - 1;
        }
        console.log(`uploading part ${index}, file range ${start} - ${end}`);
        const body = fs.createReadStream(file, {start, end});      
        const options = {
          method: 'PUT',
          uri,
          body
        };
        const res = await rp(options)
        if (res.statusCode < 200 || res.statusCode >= 300) {
          throw `unexpected status code uploading part ${res.statusCode}`;
        }
        console.log(`successfully uploaded part ${index}`);
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