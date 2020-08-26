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

const gm = require("./gm-promisify");
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require("path");
const { WatermarkProcessor } = require('./watermarkProcessor');

async function logImageMagickVersion() {
    const { stdout } = await exec("identify --version");
    console.log(".....................................................................................................");
    console.log("imagemagick version:");
    console.log(stdout.toString().trim());
    console.log(".....................................................................................................");
}

async function read(infile) {
    // for pdfs and multi-page docs/images, take the first one only
    return gm(`${infile}[0]`);
}

async function render(img, instructions, outfile) {
    if (instructions.crop) {
        const { x, y, w, h} = instructions.crop;
        img.crop(w, h, x, y);
    }

    if (instructions.width || instructions.height) {
        img.resize(instructions.width || null, instructions.height || null);
    }

    // TODO: inject watermarking
    if(instructions.watermark && typeof instructions.watermark === 'object'){
        const outdir = path.dirname(outfile);
        img = await processWatermark(img, instructions, outdir);
    }
    if (process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG){
        // removes profile and comments, for reproduceable images (for binary file comparision)
        console.log('Removing profile and metadata from rendition');
        img.strip();
    }
}

function setOutputProperties(img, instructions) {
    // for reproducible png files
    img.define("png:exclude-chunks=date");

    if (instructions.quality) {
        img.quality(instructions.quality);
    }

    // From http://www.graphicsmagick.org/GraphicsMagick.html#details-interlace (true for imagemagick also)
    // Use Line to create an interlaced PNG or GIF or progressive JPEG image.
    if (instructions.interlace === true) {
        img.interlace('Line');
    }

    // From http://www.graphicsmagick.org/GraphicsMagick.html#details-density (true for imagemagick also)
    // The density option is an attribute and does not alter the underlying raster image.
    // It may be used to adjust the rendered size for desktop publishing purposes by adjusting the scale applied to the pixels.
    // To resize the image so that it is the same size at a different resolution, use the -resample option.

    // From http://www.graphicsmagick.org/GraphicsMagick.html#details-units
    // The units of image resolution
    // Choose from: Undefined, PixelsPerInch, or PixelsPerCentimeter. This option is normally used in conjunction with the -density option.
    if (instructions.dpi) {
        img.units('pixelsperinch');
        if (typeof instructions.dpi === 'object') {
            const { xdpi, ydpi } = instructions.dpi;
            img.density(xdpi, ydpi);
        } else {
            img.density(instructions.dpi, instructions.dpi);
        }
    }

    // http://www.graphicsmagick.org/GraphicsMagick.html#details-resample (true for imagemagick also)
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
            img.resample(xdpi, ydpi);
        } else {
            img.resample(instructions.convertToDpi, instructions.convertToDpi);
        }
    }
}

async function checkJpegSize(outfile, instructions) {
    // If we specified jpegSize for JPEG output we need to verify that the size does not exceed that
    if (instructions.fmt === "jpg" && instructions.jpegSize) {

        const stat = await fs.stat(outfile);
        if (stat.size > instructions.jpegSize) {
            const img = gm(outfile);

            // From http://www.imagemagick.org/Usage/formats/#jpg
            // As of IM v6.5.8-2 you can specify a maximum output filesize for the JPEG image.
            img.define(`jpeg:extent=${instructions.jpegSize}`);

            await img.write(outfile);
        }
    }
}

async function write(img, outfile, instructions) {
    setOutputProperties(img, instructions);

    console.log("imagemagick command:", img.args().join(" "));

    // actual work will happen inside here as imagemagick only gets invoked upon gm.write()
    await img.write(outfile);

    await checkJpegSize(outfile, instructions);
}

// exported function
async function imagePostProcess(infile, outfile, instructions) {
    await logImageMagickVersion();

    //const selectedOperations = operations || DEFAULT_OPERATIONS;
    // const outdir = path.dirname(outfile);
    //img = await applyImageOperations(img, instructions, selectedOperations, outdir);

    const img = await read(infile);

    await render(img, instructions, outfile);

    await write(img, outfile, instructions);
}

async function processWatermark(img, renditionInstructions, outdir) {
    console.log('Processing watermark...');

    const watermarkProcessor = new WatermarkProcessor(renditionInstructions);
    const resizedWatermarkPath = renditionInstructions.watermark.name ? path.join(outdir, 'resized-'+ renditionInstructions.watermark.name)
        : path.join(outdir, 'resized-'+ path.basename(renditionInstructions.watermark.path));

    try {
        await watermarkProcessor.fitWatermark(resizedWatermarkPath);
    } catch(err) {
        console.error('Error while resizing watermark to rendition dimensions', err);
        // throw err; or should we revert to using original watermark as is i.e use renditionInstructions.watermark.path ?
    }
    
    // 2. resizedWatermarkPath has new watermark to be applied onto infile

    const placement = renditionInstructions.watermark.placement || 'Center';
    img.gravity(placement);
    img.composite(resizedWatermarkPath);

    console.log('Processing watermark... Done!');
    return img;
}

// async function applyImageOperations(img, instructions, operations, outdir){
//     if(operations.basicProcessing) {
//         img = processBasicImageOperations(img, instructions);
//     }

//     if(operations.watermarking) {
//         if(instructions.watermark && typeof instructions.watermark === 'object'){
//             // img = processWatermark(img, instructions.watermark);
//             img = await processWatermark(img, instructions, outdir);
//         }
//     }

//     if(process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG || operations.removeMetadata){
//         // removes profile and comments, for reproduceable images (for binary file comparision)
//         console.log('Removing profile and metadata from rendition');
//         img = img.strip();
//     }
//     return img;
// }

module.exports = imagePostProcess;