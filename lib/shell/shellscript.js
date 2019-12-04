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

const AssetComputeWorker = require('../worker');
const { actionName } = require('../action');
const errors = require('@nui/asset-compute-commons');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const stripAnsi = require('strip-ansi'); // escaping ansi content

class ShellScriptWorker {

    constructor(params, options={}) {
        this.params = params;
        this.worker = new AssetComputeWorker(params, options);
        this.script = options.script || "worker.sh";
    }

    static validate(script) {
        if (!fs.existsSync(script)) {
            throw new Error(`Shell script '${script}' not found`);
        }

        // ensure script is executable
        fs.chmodSync(script, "755");
    }

    async compute() {
        return this.worker.compute((source, rendition) => this.processWithScript(source, rendition));
    }

    async processWithScript(source, rendition) {
        console.log(`executing shell script ${this.script} for rendition ${rendition.id()}`);

        const errorFile = prepareErrorFile(rendition.directory);

        // inherit environment variables
        const env = setVariables(rendition, source, errorFile);

        try {
            // use of spawn() with separate arguments prevents shell/command injection
            await spawnProcess("/usr/bin/env", ["bash", "-x", this.script], { env });

        } catch (err) {
            throw newScriptError(err, errorFile);
        }
    }
}

function prepareErrorFile(directory) {
    const errDir = path.resolve(directory, "errors");
    fs.mkdirSync(errDir, {recursive: true});
    return path.resolve(errDir, "error.json");
}

function newScriptError(err, errorFile) {
    // this returns an Asset compute GenericError or ClientError to be thrown

    // first, we try to get error information from the errorfile
    if (fs.existsSync(errorFile)) {
        const json = fs.readFileSync(errorFile);
        fs.unlinkSync(errorFile);

        // example error json:
        // {
        //     "message": "File is not a PDF file",
        //     "reason": "SourceUnsupported"
        // }

        try {
            const errJson = JSON.parse(json);

            switch (errJson.reason) {
                case errors.Reason.RenditionFormatUnsupported:
                    return new errors.RenditionFormatUnsupportedError(errJson.message || err.message || err);
                case errors.Reason.RenditionTooLarge:
                    return new errors.RenditionTooLarge(errJson.message || err.message || err);
                case errors.Reason.SourceCorrupt:
                    return new errors.SourceCorruptError(errJson.message || err.message || err);
                case errors.Reason.SourceFormatUnsupported:
                    return new errors.SourceFormatUnsupportedError(errJson.message || err.message || err);
                case errors.Reason.SourceUnsupported:
                    return new errors.SourceUnsupportedError(errJson.message || err.message || err);
                default:
                    return new errors.GenericError(errJson.message || err.message || err, `${actionName()}_shellScript`);
            }
        } catch (parseErr) {
            // ensure that we still do proper error reporting even if the data is badly formed
            // log the json problem, then throw GenericError below
            console.log(`Badly formed json in ${errorFile}: ${parseErr}\n${json}`);
        }
    }

    // otherwise we pass through the script error
    const resultErr = new errors.GenericError(err.message || err, `${actionName()}_shellScript`);
    resultErr.exitCode = err.exitCode;
    resultErr.signal = err.signal;
    return resultErr;
}

function setVariables(rendition, source, errorFile){
    // inherit environment variables
    const env = Object.create(process.env || {});

    env.source = env.file = stripAnsi(source.path); // escape because user provided
    env.rendition = stripAnsi(rendition.path);
    env.errorfile = errorFile;

    const instructions = rendition.instructions;

    // fill out renditions
    for (const r in instructions) {
        const value = instructions[r];
        if (typeof value === 'object') {
            for (const r2 in value) {
                // TODO: unlimited object nesting support, not just 1 level
                // could flattening be used? (https://www.npmjs.com/package/flat)
                env[`rendition_${r}_${r2}`] = stripAnsi(value[r2]);
            }
        } else {
            env[`rendition_${r}`] = stripAnsi(value);
        }
    }

    return env;
}


function forEachLine(data, fn) {
    data.toString().trim().split('\n').forEach(line => fn(line));
}

async function spawnProcess(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, options);

        // log each line separately as IO Runtime's Splunk setup does not like long multi-line strings
        child.stdout.on("data", (data) => forEachLine(data, console.log));
        child.stderr.on("data", (data) => forEachLine(data, console.error));

        child.on("error", (err) => reject(err));
        child.on("exit", (code, signal) => {
            if (code !== 0) {
                const signalText = signal ? `(received signal: ${signal})` : "";
                const err = new Error(`\`${command} ${(args || []).join(" ")}\` failed with exit code ${code}${signalText}`);
                err.exitCode = code;
                err.signal = signal;
                reject(err);
            }
            resolve();
        });
    });
}

module.exports = ShellScriptWorker;