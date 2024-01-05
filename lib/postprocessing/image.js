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

const { OpenwhiskActionName, GenericError, RenditionFormatUnsupportedError, SourceCorruptError } = require('@adobe/asset-compute-commons');

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const { Storage } = require('@adobe/asset-compute-pipeline');
const { Dimensions } = require("./math");
const unitConvert = require('css-unit-converter');
const fs = require('fs-extra');
const gm = require("./gm-promisify");

const SVG_DEFAULT_WIDTH = 400; // Same value in AEM for SVGs
const WATERMARK_NAME = 'watermark.png';
// list of supported output formats
// maps our fmt ('png') to imagemagick format ('PNG') https://imagemagick.org/script/formats.php
const SUPPORTED_OUTPUT_FMT = {
    "png": "PNG",
    "jpg": "JPEG",
    "jpeg": "JPEG",
    "tif": "TIFF",
    "tiff": "TIFF",
    "gif": "GIF",
    "webp": "WEBP"
};

// list of supported input formats (intermediate rendition)
// maps imagemagick format ('PNG') https://imagemagick.org/script/formats.php to our fmt ('png')
// Note: order is important and defines priority for intermediate format - first entry will be most preferred
const SUPPORTED_INPUT_TYPES = {
    "TIFF": "tif",  // most preferred format as it allows to preserve many features
    "PNG": "png",  // lossless over
    "JPEG": "jpg",  // ..lossy
    "GIF": "gif",  // (should never get here in practice)
    "BMP": "bmp",
    "SVG": "svg",
    "SGI": "sgi",
    "RGBA": "rgba",
    "RGB": "rgb"
};
const SUPPORTED_INPUT_FORMAT_IMAGEMAGICK = Object.keys(SUPPORTED_INPUT_TYPES);
const SUPPORTED_INPUT_FMT = Object.values(SUPPORTED_INPUT_TYPES);

const DEFAULT_WORKER_SUPPORTED_OUTPUT_FMT = [
    "png"
];

// list of formats supporting transparency
const FORMAT_SUPPORTS_TRANSPARENCY = {
    "png": true,
    "tif": true,
    "tiff": true,
    "gif": true,
    "bmp": true,
    "webp": true,
    "svg": true,
    "rgba": true
};
const DEFAULT_BACKGROUND_COLOR = "rgb(255,255,255)";
const DEFAULT_TRANSPARENCCY_BACKGROUND = "rgba(0, 0, 0, 0.0)";

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
    "convertToDpi",
    "watermark",
    "pdfbgcolor"
]);

const SRGB_COLOR_PROFILE_FILE = process.env.SRGB_COLOR_PROFILE_FILE;

function isSupportedOutputFormat(fmt) {
    return Object.keys(SUPPORTED_OUTPUT_FMT).includes(fmt);
}

function isSupportedInputFormat(format) {
    return SUPPORTED_INPUT_FORMAT_IMAGEMAGICK.includes(format);
}

function hasExtraInstructions(instructions) {
    return Object.keys(instructions).some(key => EXTRA_INSTRUCTIONS.has(key));
}

async function readImageMetadataWithImageMagick(file) {
    let metadata = null;

    console.log("Reading metadata with imagemagick");
    try {
        const result = await gm(`${file}[1x1+0+0]`).write("json:-");
        const json = JSON.parse(result.toString());

        let imageMagickMetadata = null;
        if (Array.isArray(json)) {
            imageMagickMetadata = json[0].image;
        } else {
            imageMagickMetadata = json.image;
        }

        if (imageMagickMetadata) {
            metadata = {};
            metadata.FileType = imageMagickMetadata.format;
            metadata.Orientation = imageMagickMetadata.orientation;

            // at least we don't need unit conversion...
            metadata.ImageHeight = imageMagickMetadata.pageGeometry.height;
            metadata.ImageWidth = imageMagickMetadata.pageGeometry.width;
            metadata.JPEGQualityEstimate = imageMagickMetadata.quality;
        }
    } catch (err) {
        console.log(`Reading metadata using imagemagick failed with error ${err}`);

        // remove anything that might have been added to the object
        metadata = null;
    }

    return metadata;
}

function normalizeMetadata(metadata) {
    // unit conversions - SVG sizes may be in points (`pt`)
    if (typeof metadata.ImageHeight === "string") {
        metadata.ImageHeight = convertUnit(metadata.ImageHeight);
    }

    if (typeof metadata.ImageWidth === "string") {
        metadata.ImageWidth = convertUnit(metadata.ImageWidth);
    }

    if (metadata.FileType && metadata.FileType === "XMP") {
        /*
            exiftool gets an intermediate file which has some extension, as the worker 
            created an intermediate (test-worker does symlinks).
            SVG is a subset of XML, with a defined schema.
            So, exiftool, at the same time it looks at the intermediate rendition, it sees 
            that there is XML content and therefore infers it is XMP. 
            We know for sure this is wrong and in fact we have SVG, so we can fix the mistake...
        */
        // TODO Needs refactoring for a proper fix
        metadata.FileType = "SVG";
    }

    return metadata;
}

function convertUnit(stringValueWithUnit) {
    let valueInPixels;

    // get value
    const numberMatcher = /(\d*\.?\d+)\s?(px|cm|mm|in|pt|pc)/;
    const result = stringValueWithUnit.match(numberMatcher);
    // get unit, if any (no unit means it's in pixels)

    // convert to pixels
    if (result && Array.isArray(result)) {
        valueInPixels = unitConvert(result[1], result[2], 'px');
        valueInPixels = Math.round(valueInPixels);
    }
    console.log('Value converted to pixels:', valueInPixels);
    return valueInPixels;
}

function isTargetFormat(metadata, instructions) {
    const format = SUPPORTED_OUTPUT_FMT[instructions.fmt];
    if (format) {
        return metadata.FileType === format;
    }
    return false;
}

function isExpectedSize(metadata, instructions) {
    const dimension = { width: metadata.ImageWidth, height: metadata.ImageHeight };
    if (instructions.width && instructions.height) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize

        // NOTE: we don't know the aspect ratio so this is an optimistic check (trusting the worker)
        //       by just looking that just one is right, without knowing which one (||)
        return dimension.width === instructions.width || dimension.height === instructions.height;

    } else if (instructions.width) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize-width

        // NOTE: this is an optimistic check omitting validating height is in the right aspect ratio.
        //       doing this would requiring reading the original source file dimensions which we
        //       would like to avoid (extra time). For now we trust the worker...
        return dimension.width === instructions.width;

    } else if (instructions.height) {
        // tested in test-worker/test/asset-compute/worker/post-skip-jpg-resize-height

        // NOTE: this is an optimistic check omitting validating width is in the right aspect ratio.
        //       doing this would requiring reading the original source file dimensions which we
        //       would like to avoid (extra time). for now we trust the worker
        return dimension.height === instructions.height;
    }

    // if no width or height is set, we assume nothing to be done,
    // as rendition should be original size which we do not know here
    return true;
}

function hasJpegQuality(metadata, instructions) {
    if (metadata.FileType === "JPEG" && instructions.quality) {
        return metadata.JPEGQualityEstimate === instructions.quality;
    }
    // if instructions do not request it, we accept any and assume it
    return true;
}

function needsOrientationApplied(metadata) {
    if (typeof (metadata.Orientation) === "number" && metadata.Orientation > 1 && metadata.Orientation < 9) {
        return true;
    }
}

/**
 * Returns updated rendition instructions for the worker callback processing if needed
 * or undefined if no changes are required.
 */
async function prepareImagePostProcess(rendition, options) {
    const instructions = rendition.instructions;

    if (instructions.fmt && isSupportedOutputFormat(instructions.fmt)) {

        const workerName = new OpenwhiskActionName().name;

        const supportedWorkerFormats =
            options.supportedRenditionFormats
            || DEFAULT_WORKER_SUPPORTED_OUTPUT_FMT;

        // in case the worker cannot generate the final rendition format itself, we have to do it via post-processing
        if (!supportedWorkerFormats.includes(instructions.fmt)) {

            // worker-flite: do not run flite at all by not adjusting fmt for callback
            // (a fmt it does not support) so that everything will happen in post-processing
            if (workerName === "worker-flite") {
                rendition._forceImagePostProcess = true;
                return;
            }

            // ...and tell the worker to generate a different intermediate format it can do
            // find first format that is supported (worker defines priority order)
            const newFormat = supportedWorkerFormats.find(fmt => SUPPORTED_INPUT_FMT.includes(fmt));
            if (!newFormat) {
                throw new GenericError(
                    "Worker does not support generating a compatible image format. " +
                    `Requested: ${SUPPORTED_INPUT_FMT} Supported by worker: ${supportedWorkerFormats}`,
                    "prepare_image_post_process"
                );
            }

            console.log(`post-processing: adjusted fmt for worker callback: '${instructions.fmt}' -> '${newFormat}'`);

            rendition._forceImagePostProcess = true;

            return Object.assign({}, instructions, { fmt: newFormat });
        }
    }

    // return undefined if no instruction change needed
}

async function getImageMetadata(file) {
    let metadata = null;

    try {
        // To extract only metadata we need:
        const attributes = [
            "-Orientation",
            "-FileType",
            "-ImageHeight",
            "-ImageWidth",
            "-JPEGQualityEstimate"
        ];
        const attributesToExtract = attributes.join(" ");
        const command = `exiftool -n -json ${attributesToExtract} ${file}`;

        // To get all metadata (even computed): 
        // const command = `exiftool -n -json -ee -api RequestAll=3 ${file}`;

        console.log(`Metadata (exiftool) command is: ${command}`);

        const { stdout } = await exec(command);

        metadata = JSON.parse(stdout); // exiftool outputs the json as string
        if (Array.isArray(metadata)) {
            metadata = metadata[0];
        }

        if (metadata) {
            // normalization: 
            // - convert units which are not in pixels to pixels
            // - deal with some formats being wrongly identified as XMP
            metadata = normalizeMetadata(metadata);
        }

        return metadata;
    } catch (e) {
        console.log("exiftool failed to read file metadata");
        if (e.stderr && e.stderr.includes("File format error")) {
            console.log("exiftool can't read metadata because it doesn't know the file format");

            metadata = await readImageMetadataWithImageMagick(file);
            if (metadata !== null) {
                return metadata;
            }
        }

        throw new GenericError(`Reading metadata from intermediate rendition failed: ${e.message}`);
    }
}

/**
 * Returns true if the (intermediate) rendition needs image post processing.
 */
async function needsImagePostProcess(rendition, source) {
    // need to look at the original instructions for the final output,
    // not the ones for the worker callback adjusted by prepareImagePostProcess()
    const instructions = rendition.originalInstructions;

    // verify if the requested format is one we can output from post-processing
    if (!isSupportedOutputFormat(instructions.fmt)) {

        // if worker skipped AND we can't handle the output format, it effectively means
        // the conversion is not supported and an error should be sent to the client
        // normally this should not happen with proper worker routing
        if (rendition.postProcess && rendition.postProcess.skippedProcessing) {
            console.log(`Error: failing post-processing because neither the worker nor image post-processing support the output format. This indicates an incorrect worker routing.`);
            throw new RenditionFormatUnsupportedError(`Format ${instructions.fmt} is not supported for ${source.extension} files`);
        }

        // otherwise it is a non-image format etc., so image post-processing doesn't apply
        console.log(`skipping post-processing because output fmt '${instructions.fmt}' is not supported`);
        return false;
    }

    // inspect intermediate rendition
    const metadata = await getImageMetadata(rendition.path);
    rendition._intermediateMetadata = metadata;

    if (!metadata.FileType) {
        // could not recognize filetype - most likely it is corrupt
        throw new SourceCorruptError(`Rendition seems to be corrupt. Could not identify file type.`);
    }

    await logImageMagickVersion();

    // if preparePostProcess() already determined we need post-processing
    // note: do this after reading the metadata as it is required later
    if (rendition._forceImagePostProcess) {
        return true;
    }

    // check if it can read the intermediate rendition
    if (!isSupportedInputFormat(metadata.FileType)) {
        console.log(`Error: failing post-processing because intermediate rendition format '${metadata.FileType}' is not supported. The worker callback might have generated an incorrect result.`);
        throw new RenditionFormatUnsupportedError(`Format ${instructions.fmt} is not supported for ${source.extension} files`);
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
    } else if (needsOrientationApplied(metadata)) {
        console.log("running post-processing to apply orientation");
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

function getImageSize(metadata) {
    // The orientation corresponds to the TIFF orientation tag which ranges from 1 to 8
    // Values 5 to 8 require a swap of width and height
    // See https://www.awaresystems.be/imaging/tiff/tifftags/orientation.html or
    // https://www.adobe.io/content/dam/udp/en/open/standards/tiff/TIFF6.pdf
    if (parseInt(metadata.Orientation, 10) >= 5) {
        return new Dimensions(metadata.ImageHeight, metadata.ImageWidth);
    } else {
        return new Dimensions(metadata.ImageWidth, metadata.ImageHeight);
    }
}

async function applyWatemark(img, intermediateRendition, rendition, directories) {
    const instructions = rendition.instructions;
    const targetBoundingBox = new Dimensions(instructions.width, instructions.height);

    const watermarkScale = instructions.watermark.scale || 1.0;
    // determine image dimensions
    const imageSize = getImageSize(intermediateRendition._intermediateMetadata);

    const watermarkSource = instructions.watermark.image;
    // download watermark
    if (!watermarkSource) {
        // TODO: needs a new client error InvalidRenditionInstructions or the like
        throw new GenericError(`Missing watermark.image in instructions : ${JSON.stringify(instructions)}`, "image_post_process");
    }
    const asset = await Storage.getAsset(watermarkSource, directories.in, WATERMARK_NAME);
    // TODO: in future should we enforce that watermark is a png ?
    // TODO: in future handle same watermark png across multiple renditions
    const watermarkSize = new Dimensions(await gm(asset.path).size());

    // calculate target sizes
    const targetSize = imageSize.fitBoundingBox(targetBoundingBox, true);
    const watermarkTargetSize = watermarkSize.fitBoundingBox(targetSize).scale(watermarkScale);
    // ensure watermark width x height are at least 1: https://jira.corp.adobe.com/browse/ASSETS-15192
    const watermarkTargetSizeWidth = Math.max(watermarkTargetSize.width, 1.0);
    const watermarkTargetSizeHeight = Math.max(watermarkTargetSize.height, 1.0);

    img.draw([`gravity Center image Over 0,0 ${watermarkTargetSizeWidth},${watermarkTargetSizeHeight} "${asset.path}"`]);
}

async function applyOperations(img, intermediateRendition, rendition, directories) {
    const instructions = rendition.instructions;

    if (intermediateRendition._intermediateMetadata.FileType === "SVG") {
        // contrary to other supported formats, SVG is a vector format needing some special handling
        img = convertSvg(img, instructions);
    } else {
        // raster
        img = handleTransparency(img, instructions);
    }

    // handle exif orientation
    // MUST happen before img.resize() for orientation 5 to 8 (otherwise width & height must be swapped)
    // not using img.autoOrient() because that does -strip which strips the entire exif metadata
    // but we only want to remove the exif Orientation flag which we simply unset
    img.out("-auto-orient");

    if (instructions.crop) {
        const { x, y, w, h } = instructions.crop;
        img.crop(w, h, x, y);
    }

    if (instructions.width || instructions.height) {
        // set ">" to prevent upscaling
        // docs: https://www.imagemagick.org/script/command-line-processing.php#geometry
        img.resize(instructions.width || null, instructions.height || null, ">");
    }

    if (typeof instructions.watermark === 'object') {
        await applyWatemark(img, intermediateRendition, rendition, directories);
    }
}

async function applyOutputProperties(img, instructions) {
    // for reproducible png files
    if (instructions.fmt === "png") {
        img.define("png:exclude-chunks=date");
    }

    if (instructions.fmt === "tif" || instructions.fmt === "tiff") {
        // to keep same compression as initial file (e.g. for png -> tiff)
        img.define("tiff:preserve-compression=true");
    }

    if (instructions.jpegSize && (instructions.fmt === "jpg" || instructions.fmt === "jpeg")) {
        // From http://www.imagemagick.org/Usage/formats/#jpg
        // As of IM v6.5.8-2 you can specify a maximum output filesize for the JPEG image.
        img.define(`jpeg:extent=${instructions.jpegSize}`);
    }

    if (instructions.fmt === "webp") {
        // webp is most useful with lossy compression
        img.define("webp:lossless=false");
    }

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

    // Most asset compute renditions are used in digital display context (web, screens), where RGB is required
    let useColorProfileFile = false;
    if (SRGB_COLOR_PROFILE_FILE) {
        const colorProfileFileExists = await fs.pathExists(SRGB_COLOR_PROFILE_FILE);
        if (colorProfileFileExists) {
            useColorProfileFile = true;
        }
    }

    if(useColorProfileFile){
        console.log(`Using sRGB profile file: ${SRGB_COLOR_PROFILE_FILE}`);
        img.profile(SRGB_COLOR_PROFILE_FILE);
    } else {
        console.log(`Using default imagemagick sRGB colorspace`);
        img.colorspace('sRGB');
    }


    // for tests only, to be able to easily detect if post processing ran or not
    if (process.env.SDK_POST_PROCESSING_TEST_MODE) {
        img.set("comment", "Generated by Adobe Asset Compute SDK post-processing.");
    }

    img.setFormat(instructions.fmt);
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

    const start = new Date();
    try {
        // actual work will happen inside here as imagemagick only gets invoked upon gm.write()
        await img.write(outfile);
    } finally {
        console.log(`imagemagick command took ${new Date() - start} msec`);
    }
}

/**
 * Runs image post processing on the (intermediate) rendition, to create the final rendition.
 * @param {Rendition} intermediateRendition existing intermediate rendition created by the worker callback
 * @param {Rendition} rendition final rendition to write to, including instructions
 * @param {Object} directories working directories of the current activation
 */
async function imagePostProcess(intermediateRendition, rendition, directories) {
    const img = await read(intermediateRendition.path);
    img.setFormat(rendition.instructions.fmt);

    await applyOperations(img, intermediateRendition, rendition, directories);
    await applyOutputProperties(img, rendition.instructions);

    await write(img, rendition.path);
}

function convertSvg(img, instructions) {
    // ImageMagick automatically keeps aspect ratio
    // Only using width because ImageMagick will use the smallest value whether it be width or height
    const width = instructions.width || SVG_DEFAULT_WIDTH;

    img = handleTransparency(img, instructions);

    // some svgs have no size (only percentage width/height), so we scale them to our target size
    img.in("-size", `${width}`); // 2020-11-10 img.rawSize() will not be applied at the correct time and the SVG will be upscaled resulting in a fuzzy final rendition
    return img;
}

function handleTransparency(img, instructions) {
  if(instructions.pdfbgcolor) {
    // replacing transparency with a color defined in instructions
    // (disregard if the format supports keeping transparency or not)
    img.background(instructions.pdfbgcolor);
    img.flatten();
  } else {
    if (FORMAT_SUPPORTS_TRANSPARENCY[instructions.fmt]) {
        img.background(DEFAULT_TRANSPARENCCY_BACKGROUND); // Keep transparency
    } else {
        img.background(DEFAULT_BACKGROUND_COLOR); // Change tranparency background to default background color
        img.flatten();  // forces the image on its background to "commit" the background
    }

    return img;
  }
}

module.exports = {
    prepareImagePostProcess,
    needsImagePostProcess,
    imagePostProcess
};
