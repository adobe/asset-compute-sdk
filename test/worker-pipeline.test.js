/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const { AssetComputeWorkerPipeline } = require('../lib/worker-pipeline.js');

const assert = require('assert');

describe("worker-pipeline.js", () => {
    afterEach(() => {
        delete process.env.WORKER_TEST_MODE;
    });
    it("should lookup type: source-mime:png rendition-fmt:png", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.png",
            mimetype: "image/png"
        };
        const output = {
            target: "https://example.com/target.png",
            name: "cq.dam.319x319.png",
            fmt: "png"
        };
        
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/png');
        assert.strictEqual(output.type,'image/png');
    });

    it("should lookup type: source-mime:png rendition-fmt:jpg", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.png",
            mimetype: "image/png"
        };
        const output = {
            target: "https://example.com/target.jpg",
            name: "cq.dam.319x319.jpg",
            fmt: "jpg"            
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/png');
        assert.strictEqual(output.type,'image/jpeg');
    });

    it("should lookup type: source-mime:jpeg rendition-fmt:jpeg (JPEG-JPG synonym)", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.jpeg",
            mimetype: "image/jpeg"
        };
        const output = {
            target: "https://example.com/target.jpeg",
            name: "cq.dam.319x319.jpeg",
            fmt: "jpeg"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/jpeg');
        assert.strictEqual(output.type,'image/jpeg');
    });

    it("should lookup type: source-mime:tiff rendition-fmt:tif (tiff-tif synonym)", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.tiff",
            mimetype: "image/tiff"
        };
        const output = {
            target: "https://example.com/target.tif",
            name: "cq.dam.319x319.tif",
            fmt: "tif"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/tiff');
        assert.strictEqual(output.type,'image/tiff');
    });

    it("should lookup type: source-mime:tif rendition-fmt:tif (tiff-tif synonym)", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.tif",
            mimetype: "image/tif"
        };
        const output = {
            target: "https://example.com/target.tif",
            name: "cq.dam.319x319.tif",
            fmt: "tif"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/tiff');
        assert.strictEqual(output.type,'image/tiff');
    });

    it("should lookup type: source-mime:tiff rendition-fmt:tiff (tiff-tif synonym)", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.tiff",
            mimetype: "image/tiff"
        };
        const output = {
            target: "https://example.com/target.tiff",
            name: "cq.dam.319x319.tiff",
            fmt: "tiff"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/tiff');
        assert.strictEqual(output.type,'image/tiff');
    });

    it("should lookup type: source-mime:bmp rendition-fmt:gif", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.bmp",
            mimetype: "image/bmp"
        };
        const output = {
            target: "https://example.com/target.bmp",
            name: "cq.dam.319x319.gif",
            fmt: "gif"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/bmp');
        assert.strictEqual(output.type,'image/gif');
    });

    it("should lookup type: source-mime:gif rendition-fmt:tif", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.gif",
            mimetype: "image/gif"
        };
        const output = {
            target: "https://example.com/target.tif",
            name: "cq.dam.319x319.tif",
            fmt: "tif"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/gif');
        assert.strictEqual(output.type,'image/tiff');
    });

    it("should lookup type: source-mime:psd rendition-fmt:psd", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.psd",
            mimetype: "image/vnd.adobe.photoshop"
        };
        const output = {
            target: "https://example.com/target.psd",
            name: "cq.dam.319x319.psd",
            fmt: "psd"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/vnd.adobe.photoshop');
        assert.strictEqual(output.type,'image/vnd.adobe.photoshop');
    });

    it("should lookup type: source-mime:psd rendition-fmt:jpeg", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.psd",
            mimetype: "image/vnd.adobe.photoshop"
        };
        const output = {
            target: "https://example.com/target.jpeg",
            name: "cq.dam.319x319.jpeg",
            fmt: "jpeg"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/vnd.adobe.photoshop');
        assert.strictEqual(output.type,'image/jpeg');
    });

    it("should map type: source-mime:psd rendition-fmt:machine-metadata-json", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.psd",
            mimetype: "image/vnd.adobe.photoshop"
        };
        const output = {
            target: "https://example.com/target.jpeg",
            name: "cq.dam.319x319.jpeg",
            fmt: "machine-metadata-json"
        };

        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/vnd.adobe.photoshop');
        assert.strictEqual(output.type,'machine-metadata-json');
    });

    it("should not error for invalid fmt", async () => {
        const input = {
            url: "https://adobe.com",
            name: "source.psd",
            mimetype: "image/vnd.adobe.photoshop"
        };
        const output = {
            target: "https://example.com/target.invalid",
            name: "cq.dam.319x319.invalid",
            fmt: "invalid"
        };
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/vnd.adobe.photoshop');
        assert.strictEqual(output.type,false);
    });
    
    it("should map type: worker-test", async () => {
        const input = {
            path: 'test-folder-in/file.png'
        };
        const output = {
            fmt: "png"
                
        };
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,undefined);
        assert.strictEqual(output.type,'image/png');
    });
    it("should get type from extension if input.mimetype is not defined", async () => {
        const input = {
            name: 'file.png'
        };
        const output = {
            fmt: "png"
                
        };
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/png');
        assert.strictEqual(output.type,'image/png');
    });
    it("should get type from extension if input.mimetype is not correct", async () => {
        const input = {
            name: 'file.png',
            mimetype: 'application/octet-stream'
        };
        const output = {
            fmt: "png"
                
        };
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'image/png');
        assert.strictEqual(output.type,'image/png');
    });
    it("should try get type from extension if input.mimetype is the default value", async () => {
        const input = {
            name: 'file',
            mimetype: 'application/octet-stream'
        };
        const output = {
            fmt: "png"
                
        };
        const testPipelineWorker = new AssetComputeWorkerPipeline();
        testPipelineWorker.normalizeInputOuput(input, output);
        assert.strictEqual(input.type,'application/octet-stream');
        assert.strictEqual(output.type,'image/png');
    });
});
