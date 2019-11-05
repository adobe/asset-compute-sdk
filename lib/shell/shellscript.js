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

// TODO: This can now be turned into a class 

const fileUtils = require('../utils/file-utils');

const path = require('path');
const { exec, execSync } = require('child_process');
const proc = require('process');

const commandEscapist = require('command-join'); // escaping shell command
const stripAnsi = require('strip-ansi'); // escaping ansi content


function ensureExecutable(shellScript, stdio){
    try{
        const baseCommand = "chmod u+x";
        const chmodCommand = baseCommand.concat(" ", commandEscapist.commandJoin([shellScript]));
        const execResult = execSync(chmodCommand, stdio);
        return {
            error: false,
            details: execResult
        };
    } catch(e) { // https://unix.stackexchange.com/questions/52519/when-does-chmod-fail
        return {
            error: true,
            details: e // is return obj of child_process.spawnSync()
        };
    }
}

function verifyShellscriptExistence(shellScriptName, params, rendition){
    const shellScript = path.resolve(__dirname, shellScriptName);

    if (!fileUtils.existsSync(shellScript)) {
        console.log("FAILURE of worker processing for ingestionId", params.ingestionId, "rendition", rendition.name);
        return {existence: false, path: shellScript, details: "Script not found"};
    }

    return {existence: true, path: shellScript};
}

// I/O Runtime's log handling (reading logs from Splunk) currently does not like longer multi-line logs
// so we log each line individually
function handleIORuntimeLog(stdout, stderr){
    stdout.trim().split('\n').forEach(s => console.log(s));
    stderr.trim().split('\n').forEach(s => console.error(s));
}

function handleExecutionResult(error, stdout, stderr, details){
    const params = details.params;
    const rendition = details.rendition;
    const errorFile = details.errorFile;

    handleIORuntimeLog(stdout, stderr);

    if (error) {
        console.log("FAILURE of worker processing for ingestionId ", params.ingestionId, " rendition ", rendition.name);

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
        return { error: true, details: error};
    } else {
        console.log("END of worker processing for ingestionId ", params.ingestionId, " rendition ", rendition.name);
        return { error: false, rendition: rendition.name};
    }
}

function setupRunEnvironment(rendition, outdir, infile, errorFile){
    // inherit environment variables
    const env = Object.create(proc.env || {});

    env.file = path.resolve(stripAnsi(infile));
    env.rendition = path.resolve(outdir, stripAnsi(rendition.name));
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

    return Object.freeze(env);
}

function buildCommand(shellScript){
    const tracing = "BASH_XTRACEFD=1";
    const bashCommand = "/usr/bin/env bash";
    const bashParams = "-x";

    return tracing.concat(" ", bashCommand, " ", commandEscapist.commandJoin([bashParams, shellScript]));
}

function shellScript(params, renditionHelperFn, shellScriptName = "worker.sh") {
    return renditionHelperFn(params, null, function(infile, rendition, outdir) {
        return new Promise(function (resolve, reject) {
            console.log("executing shell script ", shellScriptName, " for rendition ", rendition.name);
            
            // setup run environment
            const errDir = path.resolve(outdir, "errors");
            fileUtils.mkdirsSync(errDir);
            const errorFile = path.resolve(errDir, "error.json");

            // inherit environment variables
            const env = setupRunEnvironment(rendition, outdir, infile, errorFile);

            // shellscript existence
            const scriptExistence = verifyShellscriptExistence(shellScriptName, params, rendition);
            if(!scriptExistence.existence){
                return reject(`shell script '${shellScriptName}' not found`);
            }

            // ensure script is executable
            const shellScript = scriptExistence.path;
            const executability = ensureExecutable(shellScript, {stdio: [0,1,2]});
            if(executability.error){ // could not make the script executable
                reject(executability.details);
            }

            // execution
            const options = {
                env: env,
                stdio: [0,1,2]
            };
            exec(buildCommand(shellScript), options, function (error, stdout, stderr) {
                const details = {
                    params: params, 
                    rendition: rendition,
                    errorFile: errorFile
                };
                const executionResult = handleExecutionResult(error, stdout, stderr, details);

                // error handling here
                if(executionResult.error){
                    reject(executionResult.details);
                } else {
                    // no error, rendition worked
                    resolve(executionResult.rendition);
                }
            });
        });
    });
}

module.exports = {
    shellScript
}