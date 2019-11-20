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
const { GenericError } = require('@nui/asset-compute-commons');
const fileUtils = require('../utils/file-utils');
const fs = require('fs');

const path = require('path');
const { spawn } = require('child_process');

// const commandEscapist = require('command-join'); // escaping shell command
const stripAnsi = require('strip-ansi'); // escaping ansi content

class ShellScriptWorker {
    constructor(params, options) {
        this.params = params;
        this.worker = new AssetComputeWorker(params, options);
        this.script = options.script;
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
        console.log("executing shell script ", this.script, " for rendition ", rendition.id());

        // TODO: move to separate function
        // setup run environment
        const errDir = path.resolve(rendition.directory, "errors");
        fileUtils.mkdirsSync(errDir);
        const errorFile = path.resolve(errDir, "error.json");

        // inherit environment variables
        const env = setVariables(rendition, source, errorFile);

        try {
            env.BASH_XTRACEFD = "1";
            // TODO: any more escaping required here?
            await spawnProcess("/usr/bin/env", ["bash", "-x", this.script], { env });

            // TODO: handle positive execution result?
            // no error, rendition worked
            // resolve(executionResult.rendition);

        } catch (e) {
            // TODO: move to separate function
            // We try to get error information from the errorfile, but ensure that we still do proper
            // error reporting even if the data is badly formed
            if (fileUtils.existsSync(errorFile)) {
                const json = fileUtils.readFileSync(errorFile);
                fileUtils.removeSync(errorFile);
                try {
                    const err = JSON.parse(json);
                    return { error: true, details: err};
                } catch (e) {
                    console.log(`Badly formed json for error: ${json}`);
                }
            }

            throw new GenericError(e.message || e, "shellScriptWorker");
        }
    }
}

function setVariables(rendition, source, errorFile){
    // inherit environment variables
    const env = Object.create(process.env || {});

    env.source = env.file = stripAnsi(source.path); // escape because user provided
    env.rendition = rendition.path;
    env.errorfile = errorFile;

    // fill out renditions
    for (const r in rendition) {
        const value = rendition[r];
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
        // process.on("close", (code, signal) => {
        // });
        child.on("exit", (code, signal) => {
            // if (signal !== null) {
            //     console.log(`${command} terminated due to receiving signal ${signal}`)
            // }
            if (code !== 0) {
                const signalText = signal ? `(received signal: ${signal})` : "";
                const err = new Error(`\`${command} ${(args || []).join(" ")}\` failed with exit code ${code}${signalText}`);
                err.code = code;
                err.signal = signal;
                reject(err);
            }
            resolve();
        });
    });
}

module.exports = ShellScriptWorker;