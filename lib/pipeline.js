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

// TODO: create a transformer from test/test-worker
// register transformer and start pipeline
// const Engine = require("../lib/engine");
// const { Plan } = require("../lib/plan");
const Transformer = require("../lib/transformer");
const Manifest = require("../lib/manifest");
const fs = require('fs-extra');
const path = require('path');

const MANIFEST_FILE = "pipeline-manifest.json"

async function createTransformerFromWorker(workerDirectory) {
    const rawManifest = await fs.readJson(path.resolve(workerDirectory, MANIFEST_FILE));

    const manifest = new Manifest(rawManifest);
}
