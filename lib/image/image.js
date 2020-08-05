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
const gm = require('gm');
const fs = require("fs-extra");
const path = require('path');

// Returns a temporary file name with the specified extension
function tempFileName(fmt) {
    const date = new Date();
    const milli = date.getTime();
    const tmpFile = `imagemagick-worker-${milli}.${fmt}`;
    return tmpFile;
}

function fileSize(file) {
    const stats = fs.statSync(file);
    return stats.size;
}

function imagePostProcess(infile, outfile, instructions) {
    console.log(`post processing image ${outfile}...`);
    const outdir = path.dirname(outfile);
    const renditionName = path.basename(outfile);
    return new Promise(function (resolve, reject) {
        // console.log("start conversion ", renditionName, rendition, infile);

        // call image magick wrapper around convert cli
        // for pdfs and multi-page docs/images, take the first one only
        let img = gm(`${infile}[0]`);

        // for reproducible png files
        img = img.define("png:exclude-chunks=date");

        if (instructions.crop) {
            const crop = instructions.crop;
            img = img.crop(crop.w, crop.h, crop.x, crop.y);
        }

        if (instructions.width || instructions.height) {
            img = img.resize(instructions.width || null, instructions.height || null);
        }

        if (instructions.quality) {
            img = img.quality(instructions.quality);
        }

        // From http://www.graphicsmagick.org/GraphicsMagick.html#details-interlace
        // Use Line to create an interlaced PNG or GIF or progressive JPEG image.
        if (instructions.interlace === true) {
            img = img.interlace('Line');
        }

        // From http://www.graphicsmagick.org/GraphicsMagick.html#details-density
        // The density option is an attribute and does not alter the underlying raster image.
        // It may be used to adjust the rendered size for desktop publishing purposes by adjusting the scale applied to the pixels.
        // To resize the image so that it is the same size at a different resolution, use the -resample option.

        // From http://www.graphicsmagick.org/GraphicsMagick.html#details-units
        // The units of image resolution
        // Choose from: Undefined, PixelsPerInch, or PixelsPerCentimeter. This option is normally used in conjunction with the -density option.

        if (instructions.dpi) {
            img = img.units('pixelsperinch');
            if (typeof instructions.dpi === 'object') {
                const { xdpi, ydpi } = instructions.dpi;
                img = img.density(xdpi, ydpi);
            } else {
                img = img.density(instructions.dpi, instructions.dpi);
            }
        }

        // http://www.graphicsmagick.org/GraphicsMagick.html#details-resample
        // Resize the image so that its rendered size remains the same as the original at the specified target resolution.
        // Either the current image resolution units or the previously set with -units are used to interpret the argument.
        // For example, if a 300 DPI image renders at 3 inches by 2 inches on a 300 DPI device, when the image has been
        // resampled to 72 DPI, it will render at 3 inches by 2 inches on a 72 DPI device.
        // Note that only a small number of image formats (e.g. JPEG, PNG, and TIFF) are capable of storing the image resolution.
        // For formats which do not support an image resolution, the original resolution of the image must be specified via -density
        // on the command line prior to specifying the resample resolution.
        if (instructions.convertToDpi) {
            img.units('pixelsperinch');
            if (typeof instructions.convertToDpi === 'object') {
                const { xdpi, ydpi } = instructions.convertToDpi;
                img = img.resample(xdpi, ydpi);
            } else {
                img = img.resample(instructions.convertToDpi, instructions.convertToDpi);
            }
        }

        img.write(outfile,
            function (err) {
                if (err) {
                    console.log("FAILURE of imagemagick worker processing rendition", renditionName);
                    console.error("failed conversion:", err);
                    reject(`imagemagick conversion failed: ${err.message}, code: ${err.code}, signal: ${err.signal}`);
                } else {
                    // If we specified jpegSize for JPEG output we need to verify that the size does not exceed that
                    const size = fileSize(outfile);
                    if (instructions.fmt === "jpg" && instructions.jpegSize && size > instructions.jpegSize) {
                        const newImg = gm(outfile);

                        // From http://www.imagemagick.org/Usage/formats/#jpg
                        // As of IM v6.5.8-2 you can specify a maximum output filesize for the JPEG image.
                        newImg.define(`jpeg:extent=${instructions.jpegSize}`);
                        const tmpFile = `${outdir}/${tempFileName("jpg")}`;
                        newImg.write(tmpFile,
                            function (err) {
                                if (err) {
                                    console.log("FAILURE of imagemagick worker processing rendition (fmt=jpg)", renditionName);
                                    console.error("failed conversion:", err);
                                    reject(`imagemagick conversion failed: ${err.message}, code: ${err.code}, signal: ${err.signal}`);
                                } else {
                                    fs.renameSync(tmpFile, outfile);
                                    console.log("END of imagemagick worker processing rendition", renditionName);
                                    resolve(true);
                                }
                            });
                    } else {
                        console.log("END of imagemagick worker processing rendition", renditionName);
                        resolve(true);
                    }
                }
            });
    });
}

module.exports = {
    imagePostProcess
};
