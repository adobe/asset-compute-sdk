<!--- when a new release happens, the VERSION and URL in the badge have to be manually updated because it's a private registry --->
[![npm version](https://img.shields.io/badge/%40nui%2Flibrary-25.0.0-blue.svg)](https://artifactory.corp.adobe.com/artifactory/npm-nui-release/@nui/library/-/@nui/library-25.0.0.tgz)

# Adobe Asset Compute SDK

This shared library is used by all Asset Compute workers and takes care of common functions like asset download & rendition upload.

## Installation

```bash
npm install @adobe/asset-compute-sdk
```

## Examples

### Simple javascript worker

Calls rendition function (renditionCallback) for each rendition
```js
const { worker } = require('@adobe/asset-compute-sdk');

async function renditionCallback(source, rendition, params) => {
	// ... worker logic
}
const main = worker(renditionCallback, options);
await main(params);
```
### Batch processing javascript worker

Calls rendition function once with all the renditions
```js
const { batchWorker } = require('@adobe/asset-compute-sdk');

async function batchRenditionCallback(source, rendition, outdir, params) => {
	// ... worker logic
}
const main = batchWorker(batchRenditionCallback, options);
await main(params);
```

### ShellScript worker

Processes renditions using from a worker written in shellscript
```js
const { shellScriptWorker } = require('../lib/api');

const main = shellScriptWorker(); // assumes script is in `worker.sh`
await main(params);
```

Shellscript worker with custom script name
```js
const { shellScriptWorker } = require('../lib/api');

const main = shellScriptWorker('custom-worker-name.sh'); // assumes script is in `worker.sh`
await main(params);
```

## API details

The `worker` and `batchWorker` take in two parameters: `renditonCallback` and `options` as described below.

### Rendition callback function (required)
The `renditionCallback` function is where you can put your custom worker logic. For example, if you would like to call an external API, you can make fetch requests to that API inside your `renditionCallback` function.

Parameters:
- `source`: source Object containing the following attributes:
	- name
	- path: path to local copy of source file
	- type: storage type
	- url: presigned url containing the source file
- `rendition`: rendition Object containing the following attributes:
	- instructions: rendition parameters from the worker params (e.g. quality, dpi, format, hei etc)
    - directory
    - name
    - path: path to store rendition locally (must put rendition here in order to be uploaded to cloud storage)
    - index: rendition index
    - target: presigned url to put rendition
    - metadata: object storing rendition metadata
    - size: function returning the rendition size (called like `rendition.size()`)
    - sha1: function returning the rendition sha1 (called like `rendition.sha1()`)
    - id: function returning the unique rendition id (called like `rendition.id()`)
- outdir (only in batchWorker): directory to put renditions produced in batch workers
- params: original params passed into the worker


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

#### Worker Options (optional)
Optional parameters to pass into workers
- disableSourceDownload: Boolean used to disable the source download (defaults to false)
- disableRenditionUpload: Boolean used to disable the rendition upload (defaults to false)

Disable source download example:
```js
const { worker } = require('@adobe/asset-compute-sdk');

async function renditionCallback(source, rendition, params) => {
	// downloads source inside renditionCallback so does not need asset-compute-sdk to download source file
	await fetch(source.url);
}
const options = {
	disableSourceDownload: true
}
const main = worker(renditionCallback, options);
await main(params);
```

Disable rendition upload example:
```js
const { worker } = require('@adobe/asset-compute-sdk');
const options = {
	disableRenditionUpload: true
}
const main = worker(renditionCallback, options);
await main(params);
```

### Contributing
Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

### Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
