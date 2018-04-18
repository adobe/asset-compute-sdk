// asset process library
'use strict';

const request = require('request');
const url = require('url');
const s3 = require('s3');
const fs = require('fs-extra');
const path = require('path');
const mime = require('mime-types');
const child_process = require('child_process');

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
                console.log("START download for ingestionId", params.ingestionId, "file", infile);

                // download http/https url into file
                download = new Promise(function(resolve, reject) {
                    var file = fs.createWriteStream(infile);
                    request.get(source.url, function(err, response, body) {
                        if (err) {
                            fs.unlink(infile); // Delete the file async. (But we don't check the result)
                            console.error("download failed", err);
                            reject("HTTP GET download of source " + infilename + " failed with " + err);
                        } else if (response.statusCode >= 300) {
                            fs.unlink(infile); // Delete the file async. (But we don't check the result)
                            console.error("download failed with", response.statusCode);
                            console.error(body);
                            reject("HTTP GET download of source " + infilename + " failed with " + response.statusCode + ". Body: " + body);
                        } else {
                            console.log("done downloading", infilename);
                            file.close(function() {
                                resolve(result);
                            });
                        }
                    }).pipe(file);
                });
            } else if (source.s3Key) {
                console.log("START s3 download for ingestionId", params.ingestionId, "file", infile);

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
                console.log("END download for ingestionId", params.ingestionId, "file", infile);

                // 2. create out dir
                outdir = path.join(options.dir, "out");
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
                    return Promise.reject(e);
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
                    reject("No generated renditions found.");
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

                // s3 target - a bit of a HACK, needs better design
                if (target.s3Bucket || source.s3Bucket) {
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

                        console.log("START of s3 upload for ingestionId", params.ingestionId, "(all renditions)");

                        result.s3Client.uploadDir(uploadParams)
                            .on('error', function(err) {
                                console.log("FAILURE of s3 upload for ingestionId", params.ingestionId, "(all renditions)");
                                cleanup(["unable to upload", err]);

                                reject("s3 upload of renditions failed: " + err.message);
                            })
                            .on('end', function() {
                                console.log("END of s3 upload for ingestionId", params.ingestionId, "(all renditions)");
                                cleanup();

                                resolve(result);
                            });
                    });

                } else {

                    // PUT http url in renditions
                    upload = Promise.all(params.renditions.map(function (rendition) {
                        // if the rendition was generated...
                        if (result.renditions[rendition.name]) {
                            return new Promise(function (resolve, reject) {
                                // ...upload it via PUT to the url
                                console.log("START of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                                console.log("uploading", rendition.name, "to", rendition.url);
                                let body = "";
                                let file = path.join(outdir, rendition.name);
                                let filesize = fs.statSync(file).size;
                                request({
                                    url: rendition.url,
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": rendition.mimeType || mime.lookup(rendition.name) || 'application/octet-stream'
                                    },
                                    // not using pipe() here as that leads to chunked transfer encoding which S3 does not support
                                    body: filesize == 0 ? "" : fs.readFileSync(file)
                                }, function(err, response, body) {
                                    if (err) {
                                        console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                                        console.error("upload failed", err);
                                        reject("HTTP PUT upload of rendition " + rendition.name + " failed with " + err);
                                    } else if (response.statusCode >= 300) {
                                        console.log("FAILURE of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                                        console.error("upload failed with", response.statusCode);
                                        console.error(body);
                                        reject("HTTP PUT upload of rendition " + rendition.name + " failed with " + response.statusCode + ". Body: " + body);
                                    } else {
                                        console.log("END of upload for ingestionId", params.ingestionId, "rendition", rendition.name);
                                        resolve(result);
                                    }
                                });
                            });
                        }
                    }));
                }
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

function shellScript(params, shellScriptName = "worker.sh") {
    console.log("START of worker processing for ingestionId", params.ingestionId);
    return forEachRendition(params, function(infile, rendition, outdir) {
        return new Promise(function (resolve, reject) {
            console.log("executing shell script", shellScriptName);

            var env = {
                "file": infile,
                "rendition": outdir + "/" + rendition.name
            };
            for (var r in rendition) {
                var value = rendition[r];
                if (typeof value === 'object') {
                    for (var r2 in value) {
                        // TODO: unlimited object nesting support, not just 1 level
                        env["rendition_" + r + "_" + r2] = value[r2];
                    }
                } else {
                    env["rendition_" + r] = value;
                }
            }
            var options = {
                env: env
            };

            // we are inside
            //     /nodejsAction/4v8sI58e/node_modules/nui-apl
            // and the worker.sh script will be in
            //     /nodejsAction/4v8sI58e
            // so two folders up
            var cmd = __dirname + "/../../" + shellScriptName;

            child_process.exec(cmd, options, function (error, stdout, stderr) {
                console.log(stdout);
                console.log(stderr);
                if (error) {
                    console.log("FAILURE of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
                    reject(error);
                } else {
                    console.log("END of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
                    resolve(rendition.name);
                }
            });
        });
    });
}

function shellScriptWorker(shellScriptName) {
    return function(params) {
        return shellScript(params, shellScriptName);
    }
}

module.exports = {
    filename: filename,
    process: process,
    forEachRendition: forEachRendition,
    shellScriptWorker: shellScriptWorker
}
