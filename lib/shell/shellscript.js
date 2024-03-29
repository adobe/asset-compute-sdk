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

const AssetComputeWorker = require('../worker');
const errors = require('@adobe/asset-compute-commons');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const stripAnsi = require('strip-ansi'); // escaping ansi content
const contentType = require('content-type');
const { Utils, Action } = require('@adobe/asset-compute-pipeline');

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

        const preparedFiles = await prepareMetadata(rendition.directory);

        // inherit environment variables
        const env = setVariables(rendition, source, preparedFiles);

        try {
            // use of spawn() with separate arguments prevents shell/command injection
            await spawnProcess("/usr/bin/env", ["bash", "-x", this.script], { env });

            // process metadata, if any
            if(await fs.pathExists(preparedFiles.typeFile)){ // use the path containing the file with mime information
                console.log('Reading content type information from worker generated file');

                let mimeInfoContent = await fs.readFile(preparedFiles.typeFile);
                mimeInfoContent = mimeInfoContent.toString();
                mimeInfoContent = mimeInfoContent.trim();

                try {
                    const contenttype = contentType.parse(mimeInfoContent);
                    rendition.setContentType(contenttype.type, contenttype.parameters.charset);
                } catch(ex){
                    console.log(`Could not parse type file generated by worker: ${ex.message}: ${mimeInfoContent}`);
                }
            } else {
                console.log('No content type information file found');
            }

            if (await fs.pathExists(preparedFiles.optionsFile)) {
                try {
                    const options = await fs.readJSON(preparedFiles.optionsFile);
                    if (options.postProcess === true || options.postProcess === "true") {
                        rendition.postProcess = true;
                    }
                } catch (e) {
                    console.log(`Could not parse optionsFile generated by worker: ${preparedFiles.optionsFile}`, e);
                    // don't expose too many implementation details in client facing error message
                    throw new Error(`Worker error - could not parse optionsFile`);
                }
            }
        } catch (err) {
            throw newScriptError(err, preparedFiles.errorFile);
        }
    }
}

async function prepareMetadata(directory) {
    const errDir = path.resolve(directory, "errors");
    await fs.mkdirs(errDir, {recursive: true});

    const errFile = path.resolve(errDir, "error.json");

    // Folder structure has activationid as root, so concurrent executions should not collide
    const typeFile = path.resolve(errDir, "type.txt");

    // rendition options file for options like postProcess
    const optionsFile = path.resolve(directory, 'options.json');

    return {
        errorFile: errFile,
        typeFile: typeFile,
        optionsFile: optionsFile,
    };
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
                return new errors.GenericError(errJson.message || err.message || err, `${Action.name}_shellScript`);
            }
        } catch (parseErr) {
            // ensure that we still do proper error reporting even if the data is badly formed
            // log the json problem, then throw GenericError below
            console.log(`Badly formed json in ${errorFile}: ${parseErr}\n${json}`);
        }
    }

    // otherwise we pass through the script error
    const resultErr = new errors.GenericError(err.message || err, `${Action.name}_shellScript`);
    resultErr.exitCode = err.exitCode;
    resultErr.signal = err.signal;
    return resultErr;
}

function setVariables(rendition, source, preparedFiles){
    // inherit environment variables
    const env = Object.create(process.env || {});

    env.source = env.file = stripAnsi(source.path); // escape because user provided
    env.rendition = stripAnsi(rendition.path);
    env.errorfile = preparedFiles.errorFile;
    env.typefile = preparedFiles.typeFile;
    env.optionsfile = preparedFiles.optionsFile;

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

    return Utils.limitVariableSizes(env);
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
