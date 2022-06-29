[![Version](https://img.shields.io/npm/v/@adobe/asset-compute-sdk.svg)](https://npmjs.org/package/@adobe/asset-compute-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](http://www.apache.org/licenses/LICENSE-2.0)
[![codecov](https://codecov.io/gh/adobe/asset-compute-sdk/branch/master/graph/badge.svg)](https://codecov.io/gh/adobe/asset-compute-sdk)
[![Travis](https://travis-ci.com/adobe/asset-compute-sdk.svg?branch=master)](https://travis-ci.com/adobe/asset-compute-sdk)

# Adobe Asset Compute Worker SDK


This library is required for all custom workers for the Adobe Asset Compute Service. It provides an easy to use framework and takes care of common things like asset & rendition access, validation and type checks, event notification, error handling and more.

  - [Adobe Asset Compute Worker SDK](#adobe-asset-compute-worker-sdk)
  - [Installation](#installation)
  - [Overview](#overview)
  - [Examples](#examples)
    - [Simple javascript worker](#simple-javascript-worker)
    - [Batch processing javascript worker](#batch-processing-javascript-worker)
    - [ShellScript worker](#shellscript-worker)
  - [API details](#api-details)
    - [Rendition Callback for `worker` (required)](#rendition-callback-for-worker-required)
      - [Parameters](#parameters)
        - [**`source`**](#source)
        - [**`rendition`**](#rendition)
        - [**`params`**](#params)
      - [Examples](#examples-1)
    - [Rendition Callback for `batchWorker` (required)](#rendition-callback-for-batchworker-required)
      - [Parameters](#parameters-1)
        - [**`source`**](#source-1)
        - [**`renditions`**](#renditions)
        - [**`outdir`**](#outdir)
        - [**`params`**](#params-1)
      - [Examples](#examples-2)
    - [Worker Options (optional)](#worker-options-optional)
  - [Contribution guidelines](#contribution-guidelines)
  - [Available resources and libraries](#available-resources-and-libraries)
  - [Licensing](#licensing)

## Installation

```bash
npm install @adobe/asset-compute-sdk
```

## Overview
These are the high-level steps done by the Adobe Asset Compute Worker SDK:

1. Setup
   - Initiates the metrics agent and Adobe IO Events handler (see [asset-compute-commons](https://github.com/adobe/asset-compute-commons) for more information)
   - Sets up the proper directories for local access to source and rendition
2. Download source file from `url` in [`source`](#source) object
3. Run `renditionCallback` function for each rendition ([worker](#renditioncallback-function-for-worker-required)) or for all the renditions at once ([batch worker](#renditioncallback-function-for-batchworker-required))
   - The rendition callback is where you put your worker logic. At the minimum, this function needs to convert the local source file into a local rendition file
4. Notify the client via Adobe IO Events after each rendition
   - It sends a `rendition_created` or `rendition_failed` event depending on the outcome (see [Asset Compute API asynchronous events](https://git.corp.adobe.com/nui/nui/blob/master/doc/api.md#asynchronous-events) for more information)
   - If the worker is part of a chain of workers, it will only send successful rendition events after the last worker in the chain
## Examples

### Simple javascript worker

Calls rendition function (renditionCallback) for each rendition.

```js
const { worker } = require('@adobe/asset-compute-sdk');

async function renditionCallback(source, rendition, params) => {
	// ... worker logic
}
const main = worker(renditionCallback, options);
await main(params);
```

### Batch processing javascript worker

Calls rendition function once with all the renditions.

```js
const { batchWorker } = require('@adobe/asset-compute-sdk');

async function batchRenditionCallback(source, rendition, outdir, params) => {
	// ... worker logic
}
const main = batchWorker(batchRenditionCallback, options);
await main(params);
```

### ShellScript worker

Processes renditions using from a worker written in shellscript.

```js
const { shellScriptWorker } = require('../lib/api');

const main = shellScriptWorker(); // assumes script is in `worker.sh`
await main(params);
```

Shellscript worker with custom script name

```js
const { shellScriptWorker } = require('../lib/api');

const main = shellScriptWorker('custom-worker-name.sh'); // assumes script is in `custom-worker-name.sh`
await main(params);
```

### Note on large variables
If a variable is over 128kb in size (which can happen for some XMP metadata), it cannot be passed as an environment variable to the shell script.  Instead, the variable is written to a file under `./vars` and the path to that file is stored in the environment variable.  An additional environment variable FILE_PARAMS contains the list of all variables that required this substitution (if any).  One easy way to check if a variable has been stored in a file is to check using a pattern match, for example:

```bash
# Example of passing the variable as STDIN to a command regardless of if it a file or environment variable
if [[ "$rendition_myvariable" == "./vars/"* ]]
then
    # Value was stored in a file, do something with the file contents
    cat "$rendition_myvariable" >> somecommand
else
    # The value is in the environment variable $rendition_myvariable
    echo "$rendition_myvariable" >> somecommand
```

## API details

The `worker` and `batchWorker` take two parameters: `renditionCallback` and `options` as described below.

### Rendition Callback for `worker` (required)
The `renditionCallback` function is where you put your custom worker code. The basic expectation of this function is to look at parameters from `rendition.instructions` and convert it into a rendition, then write this rendition to `rendition.path`.

Producing the rendition may involve external libraries or APIs. These steps should also be accomplished inside your `renditionCallback` function.

#### Parameters
The parameters for the rendition callback function are: `source`, `rendition`, and `params`
##### **`source`**
Object containing the following attributes:

| Name | Type | Description | Example |
|------|------|-------------|---------|
| `url` | `string` | URL pointing to the source binary. | `"http://example.com/image.jpg"` |
| `path`| `string` |  Absolute path to local copy of source file | `"/tmp/image.jpg"` |
| `name` | `string` | File name. File extension in the name might be used if no mime type can be detected. Takes precedence over filename in URL path or filename in content-disposition header of the binary resource. Defaults to "file". | `"image.jpg"` |
| `headers` | `object` | Object containining additional headers to use when doing a HTTP(S) request towards the `url` | `headers: { 'Authorization': 'auth-headers' }` |
##### **`rendition`**
Object containing the following attributes:

| Name | Type | Description |
|------|------|-------------|
| `instructions` | `object` | rendition parameters from the worker params (e.g. quality, dpi, format, height etc. See full list [here](https://docs.adobe.com/content/help/en/asset-compute/using/api.html#rendition-instructions) |
| `directory` | `string` | directory to put the renditions |
| `name` | `string` | filename of the rendition to create |
| `path` | `string` | Absolute path to store rendition locally (must put rendition here in order to be uploaded to cloud storage) |
| `index` | `number` | number used to identify a rendition |

##### **`params`**
Original parameters passed into the worker (see full [Asset Compute prcoessing API Doc](https://docs.adobe.com/content/help/en/asset-compute/using/api.html#process-request))

_Note: This argument is usually not needed, as a callback should take its information from the `rendition.instructions` which are the specific rendition parameters from the request._

#### Examples

At the bare minimum, the rendition callback function must write something to the `rendition.path`.

Simplest example (copying the source file):

```js
async function renditionCallback(source, rendition) => {
    // Check for unsupported file
    const stats = await fs.stat(source.path);
    if (stats.size === 0) {
        throw new SourceUnsupportedError('source file is unsupported');
    }
    // process infile and write to outfile
    await fs.copyFile(source.path, rendition.path);
}
```

### Rendition Callback for `batchWorker` (required)

The `renditionCallback` function in `batchWorker` is where you put your custom worker code. It works similarly to the `renditionCallback` function in `worker` with slightly different parameters. The main difference is it only gets called once per worker (instead of for each rendition).

The basic expectation of this function is to go through each of the `renditions` and using the rendition's `instructions` convert the it into a rendition, then write this rendition to it's corresponding `rendition.path`.


#### Parameters
The parameters for the rendition callback function are: `source`, `renditions`, `outdir`, and `params`
##### **`source`**
Source is the exact same as for `renditionCallback` in `worker`
##### **`renditions`**
Renditions is an array of `rendition` objects. Each `rendition` object has the same structure as for `renditionCallback` in `worker`
##### **`outdir`**
directory to put renditions produced in batch workers
##### **`params`**
`params` is the exact same as for `renditionCallback` in `worker`

#### Examples

At the bare minimum, the rendition callback function must write something to the `rendition.path`.

Simplest example (copying the source file):

```js
async function renditionCallback(source, renditions, outdir, params) => {
    // Check for unsupported file
    const stats = await fs.stat(source.path);
    if (stats.size === 0) {
        throw new SourceUnsupportedError('source file is unsupported');
    }
    // process infile and write to outfile
    renditions.forEach(rendition, () => {
        await fs.copyFile(source.path, outdir + rendition.path);
    })
}
```

### Worker Options (optional)
Optional parameters to pass into workers

- `disableSourceDownload`: Boolean used to disable the source download (defaults to false).
- `disableRenditionUpload`: Boolean used to disable the rendition upload (defaults to false).
  
  WARNING: Use this flag only if no rendition should be uploaded. This will make the worker activation fail since the asset compute SDK expects a rendition output. 

Disable source download example:

```js
const { worker } = require('@adobe/asset-compute-sdk');

async function renditionCallback(source, rendition, params) => {
	// downloads source inside renditionCallback so does not need asset-compute-sdk to download source file
	await fetch(source.url);
}
const options = {
	disableSourceDownload: true
};
const main = worker(renditionCallback, options);
await main(params);
```

Disable rendition upload example:

```js
const { worker } = require('@adobe/asset-compute-sdk');
const options = {
	disableRenditionUpload: true
};
const main = worker(renditionCallback, options);
await main(params);
```

## Post processing

_Note: this feature is not available for custom workers of the Adobe Asset Compute service_.

Image post processing is available since version `2.4.0` and must be enabled by the worker by setting

```
rendition.postProcess = true;
```

in the processing callback.

For shell script workers, they can create a JSON file whose path is given to the script by the env var `optionsfile` and include this in the file:

```json
{
    "postProcess": true
}
```

### Post processing features

These instructions are supported:

- `fmt` with png, jpg/jpeg, tif/tiff and gif
- `width` and `height`
- `quality` for jpeg and gif
- `interlace` for png
- `jpegSize` for jpeg
- `dpi`
- `convertToDpi`
- `crop`

## Contribution guidelines

Asset Compute Service has repository modularity and naming guidelines. It is modular to the extent possible, as fostered by the serverless concept and OpenWhisk framework. It means having small and focused GitHub repositories that support decoupled development and deployment lifecycles. One repository for one action is OK if it represents its own small services such as a worker. If you want to create a separate repository, log an issue in [Asset Compute SDK repository](https://github.com/adobe/asset-compute-sdk).

For detailed guidelines, see the [contribution guidelines](./.github/CONTRIBUTING.md). Also, follow these [Git commit message guidelines](https://chris.beams.io/posts/git-commit/).

## Available resources and libraries

The open-sourced libraries of Asset Compute Service are:

* [Asset Compute SDK](https://github.com/adobe/asset-compute-sdk): the worker SDK and main framework for third-party custom workers.
* [Asset Compute Commons](https://github.com/adobe/asset-compute-commons): Common utilities needed by all Asset Compute serverless actions.
* [Asset Compute Client](https://github.com/adobe/asset-compute-client): JavaScript client for the Adobe Asset Compute Service.
* [Asset Compute example workers](https://github.com/adobe/asset-compute-example-workers): Samples of third-party Asset Compute worker.
* [ESlint configuration](https://github.com/adobe/eslint-config-asset-compute): Shared ESLint configuration for Nodejs projects related to the Adobe Asset Compute service.
* [Asset Compute Development Tool](https://github.com/adobe/asset-compute-devtool): Library for the developer tool to explore and to test the Adobe Asset Compute Service.
* [aio-cli-plugin-asset-compute](https://github.com/adobe/aio-cli-plugin-asset-compute): Asset Compute plug-in for Adobe I/O Command Line Interface.
* [Adobe Asset Compute integration tests](https://github.com/adobe/asset-compute-integration-tests): Integration tests for the Asset Compute developer experience.

## Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
