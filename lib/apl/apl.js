// asset process library
'use strict';

const s3 = require('s3');
const fs = require('fs-extra');
const path = require('path');

module.exports.process = function(params, options, workerFn) {
    if (typeof options === "function") {
        workerFn = options;
        options = {};
    }
    options.dir = options.dir || ".";

    var indir, outdir;
    function cleanup(err) {
        if (err) console.error(err);
        if (indir) fs.removeSync(indir);
        if (outdir) fs.removeSync(outdir);
    }

    return new Promise(function(resolve, reject) {
        var source = params.source;

        // 0. create in dir
        indir = path.join(options.dir, "in");
        console.log("indir", indir);

        fs.removeSync(indir);
        fs.mkdirsSync(indir);
        var infile = path.join(indir, source.s3Key);

        if (!source.s3Key) {
            return reject("can only handle S3 source references, requires source.s3Key");
        }

        if (!source.s3Region || !source.s3Bucket || !source.accessKey || !source.secretKey) {
            return reject("S3 source reference requires fields s3Region, s3Bucket, accessKey and secretKey.");
        }

        // 1. download file from s3
        var s3Client = s3.createClient({
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

        console.log("start download of " + infile);

        s3Client.downloadFile(downloadParams)
        .on('error', function(err) {
            console.log("error download", err);
            cleanup(["error download", err]);

            reject("s3 download failed: " + err.message);
        })
        .on('end', function() {
            console.log("end download");
            
            // 2. create out dir
            outdir = path.join(options.dir, "out");
            console.log("outdir", outdir);
            fs.removeSync(outdir);
            fs.mkdirsSync(outdir);
            
            // --------------------------------------------------------

            // 3. run worker (or get worker promise)
            try {
                var fnResult = workerFn(infile, params, outdir);
            } catch(e) {
                cleanup(["js worker failed", err]);
                reject(e.message);
                return;
            }

            // --------------------------------------------------------

            // Non-promises/undefined instantly resolve.
            Promise.resolve(fnResult).then(function (workerResult) {
                console.log("workerResult", workerResult);

                // 4. collect generated files
                var renditions = {};
                var files = fs.readdirSync(outdir);
                files.forEach(f => {
                    var stat = fs.statSync(path.join(outdir, f));
                    if (stat.isFile()) {
                        console.log("- rendition found:", f);
                        renditions[f] = {
                            size: stat.size
                        };
                    }
                });
        
                // 5. upload generated renditions (entire outdir)

                var target = params.target || {};

                // check if target is a different location or different credentials
                if (target.s3Region || target.accessKey || target.secretKey) {
                    s3Client = s3.createClient({
                        s3Options: {
                            region: target.s3Region || source.s3Region,
                            accessKeyId: target.accessKey || source.accessKey,
                            secretAccessKey: target.secretKey || source.secretKey,
                        },
                    });
                }

                var uploadParams = {
                    localDir: outdir,
                    followSymlinks: false,
                    // TODO: filter out subfolders
                    // getS3Params: function(localFile, stat, callback) {
                    //     callback(s3Params);
                    // },

                    s3Params: {
                        Bucket: target.s3Bucket || source.s3Bucket,
                        Prefix: target.s3Prefix || source.s3Key + "_renditions/",
                    },
                };

                console.log("start uploading");

                s3Client.uploadDir(uploadParams)
                .on('error', function(err) {
                    cleanup(["unable to upload", err]);

                    reject("s3 upload of renditions failed: " + err.message);
                })
                .on('end', function() {
                    cleanup();

                    console.log("done uploading");
                    resolve({
                        ok: true,
                        renditions: renditions,
                        workerResult: workerResult,
                        params: params
                    });
                });
            }).catch(function (error) {
                cleanup(error);
                reject(error);
            });

        });    
    });
};
