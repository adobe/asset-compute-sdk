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

    return new Promise(function(resolve, reject) {
        var file = params.file;

        // 0. create in dir
        var indir = path.join(options.dir, "in");
        console.log("indir", indir);

        fs.removeSync(indir);
        fs.mkdirsSync(indir);
        var infile = path.join(indir, file.s3Key);

        // 1. download file from s3
        var s3Client = s3.createClient({
            s3Options: {
                region: file.region || "us-west-1",
                accessKeyId: file.accessKey,
                secretAccessKey: file.secretKey,
            },
        });

        var downloadParams = {
            localFile: infile,
            s3Params: {
                Bucket: file.s3Bucket,
                Key: file.s3Key
            }
        };

        console.log("start download of " + infile);

        s3Client.downloadFile(downloadParams)
        .on('error', function(err) {
            console.log("error download", err);

            reject("s3 download failed: " + err.message);
        })
        .on('end', function() {
            console.log("end download");
            
            // 2. create out dir
            var outdir = path.join(options.dir, "out");
            console.log("outdir", outdir);
            fs.removeSync(outdir);
            fs.mkdirsSync(outdir);
            
            // --------------------------------------------------------
            // 3. run worker
            try {
                var workerResult = workerFn(infile, params, outdir);
                console.log("workerResult", workerResult);
            } catch(e) {
                fs.removeSync(indir);
                fs.removeSync(outdir);
                reject(e);
                return;
            }

            // --------------------------------------------------------

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
            var uploadParams = {
                localDir: outdir,
                followSymlinks: false,
                // TODO: filter out subfolders
                // getS3Params: function(localFile, stat, callback) {
                //     callback(s3Params);
                // },

                s3Params: {
                    Bucket: file.s3Bucket,
                    Prefix: file.s3Key + "_renditions/",
                },
            };
        
            console.log("start uploading");

            s3Client.uploadDir(uploadParams)
            .on('error', function(err) {
                fs.removeSync(indir);
                fs.removeSync(outdir);

                console.error("unable to upload:", err.stack);
                reject("s3 upload of renditions failed: " + err.message);
            })
            .on('end', function() {
                fs.removeSync(indir);
                fs.removeSync(outdir);

                console.log("done uploading");
                resolve({
                    ok: true,
                    renditions: renditions,
                    workerResult: workerResult,
                    params: params
                });
            });
        });    
    });
};
