// asset process library
'use strict';

const request = require('request');
const url = require('url');
const s3 = require('s3');
const fs = require('fs-extra');
const path = require('path');

const DEFAULT_SOURCE_FILE = "source.file";

function filename(source) {
    if (typeof source === 'string') {
        source = { url: source };
    }

    if (source.url) {
        return path.basename(url.parse(source.url).pathname) || DEFAULT_SOURCE_FILE;

    } else if (source.s3Key) {
        return source.s3Key;
    }

    return DEFAULT_SOURCE_FILE;
}

function process(params, options, workerFn) {
    if (typeof options === "function") {
        workerFn = options;
        options = {};
    }
    options.dir = options.dir || ".";

    var result = {};

    var indir, outdir;
    function cleanup(err) {
        if (err) console.error(err);
        if (indir) fs.removeSync(indir);
        if (outdir) fs.removeSync(outdir);
    }

    return new Promise(function(resolve, reject) {
        try {
            
            // 0. create in dir
            indir = path.join(options.dir, "in");
            console.log("indir", indir);
            fs.removeSync(indir);
            fs.mkdirsSync(indir);

            var download;

            var source = params.source;
            if (source == undefined) {
                reject("No 'source' in params. Required for asset workers.");
                return;
            }
            if (typeof source === 'string') {
                source = { url: source };
            }

            var infilename = filename(source);
            var infile = path.join(indir, infilename);

            if (source.url) {
                console.log("start download into " + infile);

                // download http/https url into file
                download = new Promise(function(resolve, reject) {
                    var file = fs.createWriteStream(infile);
                    request
                        .get(source.url)
                        .on('error', function(err) {
                            fs.unlink(infile); // Delete the file async. (But we don't check the result)
                            reject(err);
                        })
                        .on('end', function() {
                            file.close(function() {
                                resolve(result);
                            });
                        })
                        .pipe(file);
                });
            } else if (source.s3Key) {
                console.log("start s3 download into " + infile);

                if (!source.s3Region || !source.s3Bucket || !source.accessKey || !source.secretKey) {
                    return reject("S3 source reference requires fields s3Region, s3Bucket, accessKey and secretKey.");
                }

                download = new Promise(function (resolve, reject) {
                    // 1. download file from s3
                    result.s3Client = s3.createClient({
                        s3Options: {
                            region: source.s3Region,
                            accessKeyId: source.accessKey,
                            secretAccessKey: source.secretKey,
                        },
                    });

                    var downloadParams = {
                        localFile: infile,
                        s3Params: {
                            Bucket: source.s3Bucket,
                            Key: source.s3Key
                        }
                    };

                    result.s3Client
                        .downloadFile(downloadParams)
                        .on('error', function(err) {
                            console.error("error s3 download", err);
                            cleanup();

                            reject("s3 download failed: " + err.message);
                        })
                        .on('end', function() {
                            resolve(result);
                        });
                });
            } else {
                return reject("either source.url or source.s3Key (with S3 params) required");
            }

            download.then(function(result) {
                console.log("end download");
            
                // 2. create out dir
                outdir = path.join(options.dir, "out");
                console.log("outdir", outdir);
                fs.removeSync(outdir);
                fs.mkdirsSync(outdir);
            
                // --------------------------------------------------------

                // 3. run worker (or get worker promise)
                try {
                    var workerResult = workerFn(infile, params, outdir);

                    // Non-promises/undefined instantly resolve
                    return Promise.resolve(workerResult)
                        .then(function(workerResult) {
                            result.workerResult = workerResult;
                            return Promise.resolve(result);
                        })
                        .catch(function(err) {
                            cleanup();
                            return Promise.reject(err);
                        });

                } catch (e) {
                    cleanup(["js worker failed", e]);
                    reject(e.message);
                }

                // --------------------------------------------------------

            }).then(function (result) {
                console.log("workerResult", result.workerResult);

                // 4. collect generated files
                result.renditions = {};
                var count = 0;
                var files = fs.readdirSync(outdir);
                files.forEach(f => {
                    var stat = fs.statSync(path.join(outdir, f));
                    if (stat.isFile()) {
                        console.log("- rendition found:", f);
                        result.renditions[f] = {
                            size: stat.size
                        };
                        count += 1;
                    }
                });
                
                if (count == 0) {
                    resolve({
                        ok: false,
                        message: "No generated renditions found.",
                        renditions: result.renditions,
                        params: params
                    });
                }

                return result;

            }).then(function(result) {
                // 5. upload generated renditions (entire outdir)

                var target = params.target || {};

                var upload;

                // add other target storage types here
                // if (target.ftp) {
                //     upload = new Promise(function (resolve, reject) {
                //     });
                // } else if (target.azure) {
                //     upload = new Promise(function (resolve, reject) {
                //     });
                // } else {
                // }

                // s3 target
                upload = new Promise(function (resolve, reject) {

                    target.s3Region  = target.s3Region || source.s3Region;
                    target.s3Bucket  = target.s3Bucket || source.s3Bucket;
                    target.accessKey = target.accessKey || source.accessKey;
                    target.secretKey = target.secretKey || source.secretKey;

                    if (!target.s3Region || !target.s3Bucket || !target.accessKey || !target.secretKey) {
                        return reject("S3 target reference requires fields s3Region, s3Bucket, accessKey and secretKey.");
                    }

                    // check if target is a different location or different credentials
                    if (!result.s3Client || target.s3Region != source.s3Region || target.accessKey != source.accessKey || target.secretKey != source.secretKey) {
                        result.s3Client = s3.createClient({
                            s3Options: {
                                region: target.s3Region,
                                accessKeyId: target.accessKey,
                                secretAccessKey: target.secretKey,
                            },
                        });
                    }

                    var uploadParams = {
                        localDir: outdir,
                        followSymlinks: false,
                        s3Params: {
                            Bucket: target.s3Bucket,
                            Prefix: target.s3Prefix || infilename + "_renditions/",
                        },
                    };

                    console.log("start uploading to s3");

                    result.s3Client.uploadDir(uploadParams)
                        .on('error', function(err) {
                            cleanup(["unable to upload", err]);

                            reject("s3 upload of renditions failed: " + err.message);
                        })
                        .on('end', function() {
                            cleanup();

                            console.log("done uploading");
                            resolve(result);
                        });
                });
                return upload;
            
            }).then(function(result) {
                resolve({
                    ok: true,
                    renditions: result.renditions,
                    workerResult: result.workerResult,
                    params: params
                });
            }).catch(function (error) {
                cleanup(error);
                reject(error);
            });
        } catch (e) {
            console.error(e);
            reject("error in apl lib: " + e);
        }
    });
};

function forEachRendition(params, options, renditionFn) {
    if (typeof options === "function") {
        params, options, renditionFn = options;
        options = {};
    }
    return process(params, options, function(infile, params, outdir) {

        var promise = Promise.resolve();
        
        var renditionResults = [];
        
        if (Array.isArray(params.renditions)) {
            // for each rendition to generate, create a promise that calls the actual rendition function passed
            var renditionPromiseFns = params.renditions.map(function (rendition) {
                
                // default rendition filename if not specified
                if (rendition.name === undefined) {
                    var size = rendition.wid + 'x' + rendition.hei;
                    rendition.name = path.basename(infile) + '.' + size + '.' + rendition.fmt;
                } else {
                    if (path.extname(rendition.name) != '.' + rendition.fmt) {
                        rendition.name = rendition.name + '.' + rendition.fmt;
                    }
                }

                // for sequential execution below it's critical to not start the promise executor yet,
                // so we collect functions that return promises
                return function() {
                    return new Promise(function (resolve, reject) {
                        try {
                            var result = renditionFn(infile, rendition, outdir, params);

                            // Non-promises/undefined instantly resolve
                            return Promise.resolve(result).then(function(result) {
                                renditionResults.push(result);
                                resolve();
                            }).catch(function(err) {
                                reject(err);
                            });

                        } catch (e) {
                            reject(e.message);
                        }
                    });
                };
            });

            if (options.parallel) {
                // parallel execution
                promise = Promise.all(renditionPromiseFns.map(function(promiseFn) {
                    return promiseFn();
                }));
            } else {
                // sequential execution
                for (var i=0; i < renditionPromiseFns.length; i++) {
                    promise = promise.then(renditionPromiseFns[i]);
                }
            }
        }

        return promise.then(function() {
            return { renditions: renditionResults };
        });
    });
}

module.exports = {
    filename: filename,
    process: process,
    forEachRendition: forEachRendition
}
