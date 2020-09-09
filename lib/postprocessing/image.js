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
    const metadata = await getImageMetadata(rendition.path);

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

async function applyOperations(img, instructions) {
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

    const targetBoundingBox = new Dimension(319, 319);
    const watermarkScale = 1.0;

    // determine image dimensions
    const imageSize = new Dimension(await gm(imagePath).size());
    const watermarkSize = new Dimension(await gm(watermarkPath).size());

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

    await applyOperations(img, rendition.instructions);

    await applyOutputProperties(img, rendition.instructions);

    await write(img, outfile);
}

module.exports = {
    needsImagePostProcess,
    imagePostProcess
};
