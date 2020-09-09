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
const { Dimension } = require("./math");
const util = require('util');
const { fstat } = require("fs");
const exec = util.promisify(require('child_process').exec);

// list of supported output formats
// maps our fmt ('png') to imagemagick format ('PNG') https://imagemagick.org/script/formats.php
const SUPPORTED_OUTPUT_FMT = {
    "png": "PNG",
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "tif": "TIFF",
    "tiff": "TIFF",
    "gif": "GIF"
};

// list of supported input formats (intermediate rendition)
// in imagemagick format https://imagemagick.org/script/formats.php
const SUPPORTED_INPUT_FMT = new Set([
    "PNG",
    "JPEG",
    "TIFF",
    "GIF",
    "BMP"
]);

// list of post processing instructions
//
// EXTRA_INSTRUCTIONS includes the ones that only post processing can handle,
// so if they are present, post processing will run regardless of what the worker
// itself might have generated already
//
// we also handle the following, but these could be handled by
// the worker already - which is checked dynamically below
//   fmt      - isTargetFormat()
//   width    - isExpectedSize()
//   height   - isExpectedSize()
//   quality  - hasJpegQuality()

const EXTRA_INSTRUCTIONS = new Set([
    "crop",
    "jpegSize",
    "interlace",
    "dpi",
    "convertToDpi"
]);

function isSupportedOutputFormat(instructions) {
    return Object.keys(SUPPORTED_OUTPUT_FMT).includes(instructions.fmt);
}

function isSupportedInputFormat(metadata) {
    return SUPPORTED_INPUT_FMT.has(metadata.format);
}

function hasExtraInstructions(instructions) {
    return Object.keys(instructions).some(key => EXTRA_INSTRUCTIONS.has(key));
}

async function getImageMetadata(file) {
    try {
        // [1x1+0+0] is a trick to avoid reading all pixels into memory, improving time for large images
        const result = await gm(`${file}[1x1+0+0]`).write("json:-");
        const json = JSON.parse(result.toString());

        // newer imagemagick returns an array (for multi-page formats), older just one object (6.8.9-9 at least)
        if (Array.isArray(json)) {
            return json[0].image;
        } else {
            return json.image;
        }
    } catch (e) {
        throw new Error(`Reading metadata from intermediate rendition failed: ${e.message}`);
    }
}

function isTargetFormat(metadata, instructions) {
    const format = SUPPORTED_OUTPUT_FMT[instructions.fmt];
    if (format) {
        return metadata.format === format;
    }

    return false;
}

function isExpectedSize(metadata, instructions) {
    const dimension = metadata.pageGeometry;
    if (instructions.width && instructions.height) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize

        // TODO: we don't know the aspect ratio so this is an optimistic check (trusting the worker)
        //       by just looking that just one is right, without knowing which one (||)
        return dimension.width === instructions.width || dimension.height === instructions.height;

    } else if (instructions.width) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize-width

        // TODO: this is an optimistic check omitting validating height is in the right aspect ratio.
        //       doing this would requiring reading the original source file dimensions which we
        //       would like to avoid (extra time). for now we trust the worker
        return dimension.width === instructions.width;

    } else if (instructions.height) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize-height

        // TODO: this is an optimistic check omitting validating width is in the right aspect ratio.
        //       doing this would requiring reading the original source file dimensions which we
        //       would like to avoid (extra time). for now we trust the worker
        return dimension.height === instructions.height;
    }

    // if no width or height is set, we assume nothing to be done,
    // as rendition should be original size which we do not know here
    return true;
}

function hasJpegQuality(metadata, instructions) {
    if (metadata.format === "JPEG" && instructions.quality) {
        return metadata.quality === instructions.quality;
    }
    // if instructions do not request it, we accept any and assume it
    return true;
}

async function needsImagePostProcess(rendition) {
    const instructions = rendition.instructions;

    // verify if the requested format is one we can output from post-processing
    if (!isSupportedOutputFormat(instructions)) {
        console.log(`skipping post-processing because output fmt '${instructions.fmt}' is not supported`);
        return false;
    }

    await logImageMagickVersion();

    // inspect intermediate rendition
    const metadata = rendition.intermediateMetadata = await getImageMetadata(rendition.path);

    // check if it can read the intermediate rendition
    if (!isSupportedInputFormat(metadata)) {
        console.log(`skipping post-processing because intermediate rendition format '${metadata.format}' is not supported`);
        return false;
    }

    // check if there is an instruction that definitely needs post processing
    // fast check first, which does not requiring reading image
    if (hasExtraInstructions(instructions)) {
        console.log("running post-processing because instructions require it");
        return true;

    } else if (!isTargetFormat(metadata, instructions)) {
        console.log("running post-processing to convert to target format");
        return true;

    } else if (!isExpectedSize(metadata, instructions)) {
        console.log("running post-processing to resize");
        return true;

    } else if (!hasJpegQuality(metadata, instructions)) {
        console.log("running post-processing to set jpg quality");
        return true;
    }

    console.log("skipping post-processing because intermediate rendition meets the target");
    return false;
}

// ----------------------------- image conversion -----------------

async function logImageMagickVersion() {
    const { stdout } = await exec("identify --version");
    console.log(".....................................................................................................");
    console.log(stdout.toString().trim());
    console.log(".....................................................................................................");
}

async function read(infile) {
    // for pdfs and multi-page docs/images, take the first one only
    return gm(`${infile}[0]`);
}

async function applyOperations(img, rendition) {
    const instructions = rendition.instructions;
    // handle exif orientation
    // MUST happen before img.resize() for orientation 5 to 8 (otherwise width & height must be swapped)
    // not using img.autoOrient() because that does -strip which strips the entire exif metadata
    // but we only want to remove the exif Orientation flag which we simply unset
    img.out("-auto-orient");
    img.out("-orient");
    img.out("Undefined");

    if (instructions.crop) {
        const { x, y, w, h} = instructions.crop;
        img.crop(w, h, x, y);
    }

    if (instructions.width || instructions.height) {
        // set ">" to prevent upscaling
        // docs: https://www.imagemagick.org/script/command-line-processing.php#geometry
        img.resize(instructions.width || null, instructions.height || null, ">");
    }

    // TODO: inject watermarking
    if(instructions.watermark && typeof instructions.watermark === 'object'){

        const targetBoundingBox = new Dimension(instructions.width, instructions.height);
        const watermarkScale = 1.0;

        // determine image dimensions
        const imageSize = new Dimension(rendition.intermediateMetadata.pageGeometry);
        // TODO download watermark
        const pngFileData = Buffer.from('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','base64');
        const fs = require('fs');
        fs.writeFileSync('watermark.png', pngFileData);
        const watermarkSize = new Dimension(await gm('watermark.png').size());

        console.log("imageSize:", imageSize);
        console.log("watermarkSize:", watermarkSize);

        // calculate target sizes
        const targetSize = imageSize.fitBoundingBox(targetBoundingBox);
        const watermarkTargetSize = watermarkSize.fitBoundingBox(targetSize).scale(watermarkScale);

        console.log("=>");
        console.log("targetSize", targetSize);
        console.log("watermarkTargetSize", watermarkTargetSize);

        // await gm(imagePath)
        // .resize(targetBoundingBox.width, targetBoundingBox.height, ">")
        // .draw([`gravity Center image Over 0,0 ${watermarkTargetSize.width},${watermarkTargetSize.height} ${watermarkPath}`])
        // .write(`${imagePath}.watermarked.png`);
    }
}

async function applyOutputProperties(img, instructions) {
    // for reproducible png files
    if (instructions.fmt === "png") {
        img.define("png:exclude-chunks=date");
    }

    if (instructions.jpegSize && (instructions.fmt === "jpg" || instructions.fmt === "jpeg")) {
        // From http://www.imagemagick.org/Usage/formats/#jpg
        // As of IM v6.5.8-2 you can specify a maximum output filesize for the JPEG image.
        img.define(`jpeg:extent=${instructions.jpegSize}`);
    }

    // Most asset compute renditions are used in digital display context (web, screens), where RGB is required
    img.colorspace('sRGB');

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

    // for tests only, to be able to easily detect if post processing ran or not
    if (process.env.SDK_POST_PROCESSING_TEST_MODE) {
        img.set("comment", "Generated by Adobe Asset Compute SDK post-processing.");
    }
}

async function write(img, outfile) {
    const args = img.args();
    // fix command to include output filename
    if (args[args.length - 1] === "-") {
        args[args.length - 1] = outfile;
    }
    // quote args that include whitespaces - even if this is just for logging, it looks weird
    for (let i = 0; i < args.length; i++) {
        if (typeof args[i] === "string" && args[i].includes(" ")) {
            args[i] = `'${args[i]}'`;
        }
    }
    console.log("imagemagick command:", args.join(" "));

    // actual work will happen inside here as imagemagick only gets invoked upon gm.write()
    await img.write(outfile);
}

// exported function
async function imagePostProcess(rendition, outfile) {
    const img = await read(rendition.path);

    await applyOperations(img, rendition);

    await applyOutputProperties(img, rendition.instructions);

    await write(img, outfile);
}

module.exports = {
    needsImagePostProcess,
    imagePostProcess
};
