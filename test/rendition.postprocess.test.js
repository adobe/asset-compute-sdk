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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const mockRequire = require("mock-require");
const { MetricsTestHelper } = mockRequire.reRequire("@adobe/asset-compute-commons");
const assert = require('assert');
const mockFs = require('mock-fs');
const fs = require('fs-extra');
const testUtil = require('./testutil');

const PNG_FILE = "test/files/fileSmall.png";

// generated from the requestBody of the upload request: Buffer.from(requestBody).toString('base64');
const BASE64_RENDITION_JPG = 'ZmZkOGZmZTAwMDEwNGE0NjQ5NDYwMDAxMDEwMDAwMDEwMDAxMDAwMGZmZGIwMDQzMDAwYzA4MDkwYjA5MDgwYzBiMGEwYjBlMGQwYzBlMTIxZTE0MTIxMTExMTIyNTFiMWMxNjFlMmMyNzJlMmUyYjI3MmIyYTMxMzc0NjNiMzEzNDQyMzQyYTJiM2Q1MzNlNDI0ODRhNGU0ZjRlMmYzYjU2NWM1NTRjNWI0NjRkNGU0YmZmZGIwMDQzMDEwZDBlMGUxMjEwMTIyNDE0MTQyNDRiMzIyYjMyNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YjRiNGI0YmZmYzIwMDExMDgwMDA2MDAwYTAzMDExMTAwMDIxMTAxMDMxMTAxZmZjNDAwMTUwMDAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDMwNGZmYzQwMDE2MDEwMTAxMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA0MDEwMmZmZGEwMDBjMDMwMTAwMDIxMDAzMTAwMDAwMDA4OTY3N2JhZmZmYzQwMDFlMTAwMDAxMDQwMTA1MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMzA0MDYwNTE0MTU1NTgyOTRmZmRhMDAwODAxMDEwMDAxM2YwMDhiNTRjMmIyZjEwM2RhYTk0NjFkMDU2ZDM1ZGUyNGZkMjRiZmZmYzQwMDE0MTEwMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEwZmZkYTAwMDgwMTAyMDEwMTNmMDAzZmZmYzQwMDE1MTEwMTAxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxMTBmZmRhMDAwODAxMDMwMTAxM2YwMDE5ZmZkOQ==';
const BASE64_RENDITION_PNG = "ODk1MDRlNDcwZDBhMWEwYTAwMDAwMDBkNDk0ODQ0NTIwMDAwMDAwYTAwMDAwMDA2MDgwNjAwMDAwMGZhZjAwZmM2MDAwMDAwMDE3MzUyNDc0MjAwYWVjZTFjZTkwMDAwMDA1MDY1NTg0OTY2NGQ0ZDAwMmEwMDAwMDAwODAwMDIwMTEyMDAwMzAwMDAwMDAxMDAwMTAwMDA4NzY5MDAwNDAwMDAwMDAxMDAwMDAwMjYwMDAwMDAwMDAwMDNhMDAxMDAwMzAwMDAwMDAxMDAwMTAwMDBhMDAyMDAwNDAwMDAwMDAxMDAwMDAwMGFhMDAzMDAwNDAwMDAwMDAxMDAwMDAwMDYwMDAwMDAwMGVjNTU3YmVhMDAwMDAxNTk2OTU0NTg3NDU4NGQ0YzNhNjM2ZjZkMmU2MTY0NmY2MjY1MmU3ODZkNzAwMDAwMDAwMDAwM2M3ODNhNzg2ZDcwNmQ2NTc0NjEyMDc4NmQ2YzZlNzMzYTc4M2QyMjYxNjQ2ZjYyNjUzYTZlNzMzYTZkNjU3NDYxMmYyMjIwNzgzYTc4NmQ3MDc0NmIzZDIyNTg0ZDUwMjA0MzZmNzI2NTIwMzUyZTM0MmUzMDIyM2UwYTIwMjAyMDNjNzI2NDY2M2E1MjQ0NDYyMDc4NmQ2YzZlNzMzYTcyNjQ2NjNkMjI2ODc0NzQ3MDNhMmYyZjc3Nzc3NzJlNzczMzJlNmY3MjY3MmYzMTM5MzkzOTJmMzAzMjJmMzIzMjJkNzI2NDY2MmQ3Mzc5NmU3NDYxNzgyZDZlNzMyMzIyM2UwYTIwMjAyMDIwMjAyMDNjNzI2NDY2M2E0NDY1NzM2MzcyNjk3MDc0Njk2ZjZlMjA3MjY0NjYzYTYxNjI2Zjc1NzQzZDIyMjIwYTIwMjAyMDIwMjAyMDIwMjAyMDIwMjAyMDc4NmQ2YzZlNzMzYTc0Njk2NjY2M2QyMjY4NzQ3NDcwM2EyZjJmNmU3MzJlNjE2NDZmNjI2NTJlNjM2ZjZkMmY3NDY5NjY2NjJmMzEyZTMwMmYyMjNlMGEyMDIwMjAyMDIwMjAyMDIwMjAzYzc0Njk2NjY2M2E0ZjcyNjk2NTZlNzQ2MTc0Njk2ZjZlM2UzMTNjMmY3NDY5NjY2NjNhNGY3MjY5NjU2ZTc0NjE3NDY5NmY2ZTNlMGEyMDIwMjAyMDIwMjAzYzJmNzI2NDY2M2E0NDY1NzM2MzcyNjk3MDc0Njk2ZjZlM2UwYTIwMjAyMDNjMmY3MjY0NjYzYTUyNDQ0NjNlMGEzYzJmNzgzYTc4NmQ3MDZkNjU3NDYxM2UwYTRjYzIyNzU5MDAwMDAwYmY0OTQ0NDE1NDA4MWQzZDhlY2I2YWMyNDAxNDg2YmYzMTMzNTQ4NTc4MmQyMWMxZDQ1MjE0N2M4MGFlZjU5NTdkMGYxZjQyOTAyMmQ5YzUzNDVhOWE3NGU4OGM2NzIyNzgxNjY3ZjFkZjk1NGEzZTNkNzI0YWJlYjMxNmRhM2ZmODc3MTA0NWY0YjRjNmY3MGNkZTdiYjQ2ZjFhNTEyOTdjMjAwNTQwYzhmZTY4ZDgxOWUzMzhlNmI3YjEwZjYxN2YzNjE1NzNkNGE1YmNjZWU2MmNiMjhjYjc0NTRlOWVlNzRjYzcxMzU2ZWI0ZDI4NDQ2Zjc3M2I4MjMzNGI1MzNlOTZlZjlkMjg0ZDEyNmVmNTU1OGExNDkzZjExYzYzMGM2YTdmMzhmYjUwNWI5NjI1NDY2YTVmYjQ4MGIyYzBiNjJkNTYzNjlmOGU1ZjM4ZTdkMGY1Y2Y4ZDZiZjU0ZDUxMTQ1NGU1ODVlMTYwZjAxNDg3YzRiYWFhYmI4ZDc3Y2I1MjRkOTA4NmI3Y2IyNjAwMDAwMDAwNDk0NTRlNDRhZTQyNjA4Mg==";
const BASE64_RENDITION_TIFF = "NGQ0ZDAwMmEwMDAwMDBmODAxMTYzM2ZmMDExNjMzZmYwMjE1MzNmZjAwMTAyZWZmMDAwOTI4ZmYwMDA2MjZmZjAwMDkyOWZmMDIwZDJkZmYwMTBmMzJmZjAwMGUzMWZmMDAwZTJiZmYwMDBmMmNmZjAwMGMyYWZmMDAwYjI5ZmYwMDBkMmNmZjA4MTczNmZmMDkxNjM2ZmYxNjIzNDNmZjBkMWIzZWZmMGMxYTNkZmYwODIwM2NmZjBiMjMzZmZmMGIyMDNkZmYxZjMyNTBmZjNhNGI2OWZmNTc2Njg1ZmY3MzgyYTFmZjg0OTFiMWZmYTdiNWQ4ZmZhN2I1ZDhmZjQ1NWU3YWZmNTI2Yjg3ZmY2YjgzOWZmZjhjYTFiZWZmYTliY2RhZmZjMWQyZjBmZmI1YzRlM2ZmYjZjNWU0ZmZjNmQ0ZjdmZmNiZDlmY2ZmYWZjYWU1ZmZhZWM3ZTNmZjljYjVkMWZmYTFiOWQ1ZmZhOGJkZGFmZmE5YmNkYWZmYTRiNWQzZmY5ZmIwY2VmZjgwOGViMWZmN2U4Y2FmZmZhMWJmZDlmZjk0YWZjYWZmN2I5NmIxZmY2Yjg0YTBmZjc1OGRhOWZmN2M5MWFlZmY3ZDkwYWVmZjdlOTFhZmZmNzA3ZWExZmY2ZjdkYTBmZjAwMTAwMTAwMDAwMzAwMDAwMDAxMDAwYTAwMDAwMTAxMDAwMzAwMDAwMDAxMDAwNjAwMDAwMTAyMDAwMzAwMDAwMDA0MDAwMDAxYmUwMTAzMDAwMzAwMDAwMDAxMDAwMTAwMDAwMTA2MDAwMzAwMDAwMDAxMDAwMjAwMDAwMTBhMDAwMzAwMDAwMDAxMDAwMTAwMDAwMTExMDAwNDAwMDAwMDAxMDAwMDAwMDgwMTEyMDAwMzAwMDAwMDAxMDAwMTAwMDAwMTE1MDAwMzAwMDAwMDAxMDAwNDAwMDAwMTE2MDAwMzAwMDAwMDAxMDAwNjAwMDAwMTE3MDAwNDAwMDAwMDAxMDAwMDAwZjAwMTFjMDAwMzAwMDAwMDAxMDAwMTAwMDAwMTI4MDAwMzAwMDAwMDAxMDAwMjAwMDAwMTUyMDAwMzAwMDAwMDAxMDAwMTAwMDAwMTUzMDAwMzAwMDAwMDA0MDAwMDAxYzY4NzczMDAwNzAwMDAwYzQ4MDAwMDAxY2UwMDAwMDAwMDAwMDgwMDA4MDAwODAwMDgwMDAxMDAwMTAwMDEwMDAxMDAwMDBjNDg0YzY5NmU2ZjAyMTAwMDAwNmQ2ZTc0NzI1MjQ3NDIyMDU4NTk1YTIwMDdjZTAwMDIwMDA5MDAwNjAwMzEwMDAwNjE2MzczNzA0ZDUzNDY1NDAwMDAwMDAwNDk0NTQzMjA3MzUyNDc0MjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDBmNmQ2MDAwMTAwMDAwMDAwZDMyZDQ4NTAyMDIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDExNjM3MDcyNzQwMDAwMDE1MDAwMDAwMDMzNjQ2NTczNjMwMDAwMDE4NDAwMDAwMDZjNzc3NDcwNzQwMDAwMDFmMDAwMDAwMDE0NjI2YjcwNzQwMDAwMDIwNDAwMDAwMDE0NzI1ODU5NWEwMDAwMDIxODAwMDAwMDE0Njc1ODU5NWEwMDAwMDIyYzAwMDAwMDE0NjI1ODU5NWEwMDAwMDI0MDAwMDAwMDE0NjQ2ZDZlNjQwMDAwMDI1NDAwMDAwMDcwNjQ2ZDY0NjQwMDAwMDJjNDAwMDAwMDg4NzY3NTY1NjQwMDAwMDM0YzAwMDAwMDg2NzY2OTY1NzcwMDAwMDNkNDAwMDAwMDI0NmM3NTZkNjkwMDAwMDNmODAwMDAwMDE0NmQ2NTYxNzMwMDAwMDQwYzAwMDAwMDI0NzQ2NTYzNjgwMDAwMDQzMDAwMDAwMDBjNzI1NDUyNDMwMDAwMDQzYzAwMDAwODBjNjc1NDUyNDMwMDAwMDQzYzAwMDAwODBjNjI1NDUyNDMwMDAwMDQzYzAwMDAwODBjNzQ2NTc4NzQwMDAwMDAwMDQzNmY3MDc5NzI2OTY3Njg3NDIwMjg2MzI5MjAzMTM5MzkzODIwNDg2NTc3NmM2NTc0NzQyZDUwNjE2MzZiNjE3MjY0MjA0MzZmNmQ3MDYxNmU3OTAwMDA2NDY1NzM2MzAwMDAwMDAwMDAwMDAwMTI3MzUyNDc0MjIwNDk0NTQzMzYzMTM5MzYzNjJkMzIyZTMxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEyNzM1MjQ3NDIyMDQ5NDU0MzM2MzEzOTM2MzYyZDMyMmUzMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA1ODU5NWEyMDAwMDAwMDAwMDAwMGYzNTEwMDAxMDAwMDAwMDExNmNjNTg1OTVhMjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDU4NTk1YTIwMDAwMDAwMDAwMDAwNmZhMjAwMDAzOGY1MDAwMDAzOTA1ODU5NWEyMDAwMDAwMDAwMDAwMDYyOTkwMDAwYjc4NTAwMDAxOGRhNTg1OTVhMjAwMDAwMDAwMDAwMDAyNGEwMDAwMDBmODQwMDAwYjZjZjY0NjU3MzYzMDAwMDAwMDAwMDAwMDAxNjQ5NDU0MzIwNjg3NDc0NzAzYTJmMmY3Nzc3NzcyZTY5NjU2MzJlNjM2ODAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxNjQ5NDU0MzIwNjg3NDc0NzAzYTJmMmY3Nzc3NzcyZTY5NjU2MzJlNjM2ODAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNjQ2NTczNjMwMDAwMDAwMDAwMDAwMDJlNDk0NTQzMjAzNjMxMzkzNjM2MmQzMjJlMzEyMDQ0NjU2NjYxNzU2Yzc0MjA1MjQ3NDIyMDYzNmY2YzZmNzU3MjIwNzM3MDYxNjM2NTIwMmQyMDczNTI0NzQyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDJlNDk0NTQzMjAzNjMxMzkzNjM2MmQzMjJlMzEyMDQ0NjU2NjYxNzU2Yzc0MjA1MjQ3NDIyMDYzNmY2YzZmNzU3MjIwNzM3MDYxNjM2NTIwMmQyMDczNTI0NzQyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA2NDY1NzM2MzAwMDAwMDAwMDAwMDAwMmM1MjY1NjY2NTcyNjU2ZTYzNjUyMDU2Njk2NTc3Njk2ZTY3MjA0MzZmNmU2NDY5NzQ2OTZmNmUyMDY5NmUyMDQ5NDU0MzM2MzEzOTM2MzYyZDMyMmUzMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyYzUyNjU2NjY1NzI2NTZlNjM2NTIwNTY2OTY1Nzc2OTZlNjcyMDQzNmY2ZTY0Njk3NDY5NmY2ZTIwNjk2ZTIwNDk0NTQzMzYzMTM5MzYzNjJkMzIyZTMxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDc2Njk2NTc3MDAwMDAwMDAwMDEzYTRmZTAwMTQ1ZjJlMDAxMGNmMTQwMDAzZWRjYzAwMDQxMzBiMDAwMzVjOWUwMDAwMDAwMTU4NTk1YTIwMDAwMDAwMDAwMDRjMDk1NjAwNTAwMDAwMDA1NzFmZTc2ZDY1NjE3MzAwMDAwMDAwMDAwMDAwMDEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMjhmMDAwMDAwMDI3MzY5NjcyMDAwMDAwMDAwNDM1MjU0MjA2Mzc1NzI3NjAwMDAwMDAwMDAwMDA0MDAwMDAwMDAwNTAwMGEwMDBmMDAxNDAwMTkwMDFlMDAyMzAwMjgwMDJkMDAzMjAwMzcwMDNiMDA0MDAwNDUwMDRhMDA0ZjAwNTQwMDU5MDA1ZTAwNjMwMDY4MDA2ZDAwNzIwMDc3MDA3YzAwODEwMDg2MDA4YjAwOTAwMDk1MDA5YTAwOWYwMGE0MDBhOTAwYWUwMGIyMDBiNzAwYmMwMGMxMDBjNjAwY2IwMGQwMDBkNTAwZGIwMGUwMDBlNTAwZWIwMGYwMDBmNjAwZmIwMTAxMDEwNzAxMGQwMTEzMDExOTAxMWYwMTI1MDEyYjAxMzIwMTM4MDEzZTAxNDUwMTRjMDE1MjAxNTkwMTYwMDE2NzAxNmUwMTc1MDE3YzAxODMwMThiMDE5MjAxOWEwMWExMDFhOTAxYjEwMWI5MDFjMTAxYzkwMWQxMDFkOTAxZTEwMWU5MDFmMjAxZmEwMjAzMDIwYzAyMTQwMjFkMDIyNjAyMmYwMjM4MDI0MTAyNGIwMjU0MDI1ZDAyNjcwMjcxMDI3YTAyODQwMjhlMDI5ODAyYTIwMmFjMDJiNjAyYzEwMmNiMDJkNTAyZTAwMmViMDJmNTAzMDAwMzBiMDMxNjAzMjEwMzJkMDMzODAzNDMwMzRmMDM1YTAzNjYwMzcyMDM3ZTAzOGEwMzk2MDNhMjAzYWUwM2JhMDNjNzAzZDMwM2UwMDNlYzAzZjkwNDA2MDQxMzA0MjAwNDJkMDQzYjA0NDgwNDU1MDQ2MzA0NzEwNDdlMDQ4YzA0OWEwNGE4MDRiNjA0YzQwNGQzMDRlMTA0ZjAwNGZlMDUwZDA1MWMwNTJiMDUzYTA1NDkwNTU4MDU2NzA1NzcwNTg2MDU5NjA1YTYwNWI1MDVjNTA1ZDUwNWU1MDVmNjA2MDYwNjE2MDYyNzA2MzcwNjQ4MDY1OTA2NmEwNjdiMDY4YzA2OWQwNmFmMDZjMDA2ZDEwNmUzMDZmNTA3MDcwNzE5MDcyYjA3M2QwNzRmMDc2MTA3NzQwNzg2MDc5OTA3YWMwN2JmMDdkMjA3ZTUwN2Y4MDgwYjA4MWYwODMyMDg0NjA4NWEwODZlMDg4MjA4OTYwOGFhMDhiZTA4ZDIwOGU3MDhmYjA5MTAwOTI1MDkzYTA5NGYwOTY0MDk3OTA5OGYwOWE0MDliYTA5Y2YwOWU1MDlmYjBhMTEwYTI3MGEzZDBhNTQwYTZhMGE4MTBhOTgwYWFlMGFjNTBhZGMwYWYzMGIwYjBiMjIwYjM5MGI1MTBiNjkwYjgwMGI5ODBiYjAwYmM4MGJlMTBiZjkwYzEyMGMyYTBjNDMwYzVjMGM3NTBjOGUwY2E3MGNjMDBjZDkwY2YzMGQwZDBkMjYwZDQwMGQ1YTBkNzQwZDhlMGRhOTBkYzMwZGRlMGRmODBlMTMwZTJlMGU0OTBlNjQwZTdmMGU5YjBlYjYwZWQyMGVlZTBmMDkwZjI1MGY0MTBmNWUwZjdhMGY5NjBmYjMwZmNmMGZlYzEwMDkxMDI2MTA0MzEwNjExMDdlMTA5YjEwYjkxMGQ3MTBmNTExMTMxMTMxMTE0ZjExNmQxMThjMTFhYTExYzkxMWU4MTIwNzEyMjYxMjQ1MTI2NDEyODQxMmEzMTJjMzEyZTMxMzAzMTMyMzEzNDMxMzYzMTM4MzEzYTQxM2M1MTNlNTE0MDYxNDI3MTQ0OTE0NmExNDhiMTRhZDE0Y2UxNGYwMTUxMjE1MzQxNTU2MTU3ODE1OWIxNWJkMTVlMDE2MDMxNjI2MTY0OTE2NmMxNjhmMTZiMjE2ZDYxNmZhMTcxZDE3NDExNzY1MTc4OTE3YWUxN2QyMTdmNzE4MWIxODQwMTg2NTE4OGExOGFmMThkNTE4ZmExOTIwMTk0NTE5NmIxOTkxMTliNzE5ZGQxYTA0MWEyYTFhNTExYTc3MWE5ZTFhYzUxYWVjMWIxNDFiM2IxYjYzMWI4YTFiYjIxYmRhMWMwMjFjMmExYzUyMWM3YjFjYTMxY2NjMWNmNTFkMWUxZDQ3MWQ3MDFkOTkxZGMzMWRlYzFlMTYxZTQwMWU2YTFlOTQxZWJlMWVlOTFmMTMxZjNlMWY2OTFmOTQxZmJmMWZlYTIwMTUyMDQxMjA2YzIwOTgyMGM0MjBmMDIxMWMyMTQ4MjE3NTIxYTEyMWNlMjFmYjIyMjcyMjU1MjI4MjIyYWYyMmRkMjMwYTIzMzgyMzY2MjM5NDIzYzIyM2YwMjQxZjI0NGQyNDdjMjRhYjI0ZGEyNTA5MjUzODI1NjgyNTk3MjVjNzI1ZjcyNjI3MjY1NzI2ODcyNmI3MjZlODI3MTgyNzQ5Mjc3YTI3YWIyN2RjMjgwZDI4M2YyODcxMjhhMjI4ZDQyOTA2MjkzODI5NmIyOTlkMjlkMDJhMDIyYTM1MmE2ODJhOWIyYWNmMmIwMjJiMzYyYjY5MmI5ZDJiZDEyYzA1MmMzOTJjNmUyY2EyMmNkNzJkMGMyZDQxMmQ3NjJkYWIyZGUxMmUxNjJlNGMyZTgyMmViNzJlZWUyZjI0MmY1YTJmOTEyZmM3MmZmZTMwMzUzMDZjMzBhNDMwZGIzMTEyMzE0YTMxODIzMWJhMzFmMjMyMmEzMjYzMzI5YjMyZDQzMzBkMzM0NjMzN2YzM2I4MzNmMTM0MmIzNDY1MzQ5ZTM0ZDgzNTEzMzU0ZDM1ODczNWMyMzVmZDM2MzczNjcyMzZhZTM2ZTkzNzI0Mzc2MDM3OWMzN2Q3MzgxNDM4NTAzODhjMzhjODM5MDUzOTQyMzk3ZjM5YmMzOWY5M2EzNjNhNzQzYWIyM2FlZjNiMmQzYjZiM2JhYTNiZTgzYzI3M2M2NTNjYTQzY2UzM2QyMjNkNjEzZGExM2RlMDNlMjAzZTYwM2VhMDNlZTAzZjIxM2Y2MTNmYTIzZmUyNDAyMzQwNjQ0MGE2NDBlNzQxMjk0MTZhNDFhYzQxZWU0MjMwNDI3MjQyYjU0MmY3NDMzYTQzN2Q0M2MwNDQwMzQ0NDc0NDhhNDRjZTQ1MTI0NTU1NDU5YTQ1ZGU0NjIyNDY2NzQ2YWI0NmYwNDczNTQ3N2I0N2MwNDgwNTQ4NGI0ODkxNDhkNzQ5MWQ0OTYzNDlhOTQ5ZjA0YTM3NGE3ZDRhYzQ0YjBjNGI1MzRiOWE0YmUyNGMyYTRjNzI0Y2JhNGQwMjRkNGE0ZDkzNGRkYzRlMjU0ZTZlNGViNzRmMDA0ZjQ5NGY5MzRmZGQ1MDI3NTA3MTUwYmI1MTA2NTE1MDUxOWI1MWU2NTIzMTUyN2M1MmM3NTMxMzUzNWY1M2FhNTNmNjU0NDI1NDhmNTRkYjU1Mjg1NTc1NTVjMjU2MGY1NjVjNTZhOTU2Zjc1NzQ0NTc5MjU3ZTA1ODJmNTg3ZDU4Y2I1OTFhNTk2OTU5Yjg1YTA3NWE1NjVhYTY1YWY1NWI0NTViOTU1YmU1NWMzNTVjODY1Y2Q2NWQyNzVkNzg1ZGM5NWUxYTVlNmM1ZWJkNWYwZjVmNjE1ZmIzNjAwNTYwNTc2MGFhNjBmYzYxNGY2MWEyNjFmNTYyNDk2MjljNjJmMDYzNDM2Mzk3NjNlYjY0NDA2NDk0NjRlOTY1M2Q2NTkyNjVlNzY2M2Q2NjkyNjZlODY3M2Q2NzkzNjdlOTY4M2Y2ODk2NjhlYzY5NDM2OTlhNjlmMTZhNDg2YTlmNmFmNzZiNGY2YmE3NmJmZjZjNTc2Y2FmNmQwODZkNjA2ZGI5NmUxMjZlNmI2ZWM0NmYxZTZmNzg2ZmQxNzAyYjcwODY3MGUwNzEzYTcxOTU3MWYwNzI0YjcyYTY3MzAxNzM1ZDczYjg3NDE0NzQ3MDc0Y2M3NTI4NzU4NTc1ZTE3NjNlNzY5Yjc2Zjg3NzU2NzdiMzc4MTE3ODZlNzhjYzc5MmE3OTg5NzllNzdhNDY3YWE1N2IwNDdiNjM3YmMyN2MyMTdjODE3Y2UxN2Q0MTdkYTE3ZTAxN2U2MjdlYzI3ZjIzN2Y4NDdmZTU4MDQ3ODBhODgxMGE4MTZiODFjZDgyMzA4MjkyODJmNDgzNTc4M2JhODQxZDg0ODA4NGUzODU0Nzg1YWI4NjBlODY3Mjg2ZDc4NzNiODc5Zjg4MDQ4ODY5ODhjZTg5MzM4OTk5ODlmZThhNjQ4YWNhOGIzMDhiOTY4YmZjOGM2MzhjY2E4ZDMxOGQ5ODhkZmY4ZTY2OGVjZThmMzY4ZjllOTAwNjkwNmU5MGQ2OTEzZjkxYTg5MjExOTI3YTkyZTM5MzRkOTNiNjk0MjA5NDhhOTRmNDk1NWY5NWM5OTYzNDk2OWY5NzBhOTc3NTk3ZTA5ODRjOThiODk5MjQ5OTkwOTlmYzlhNjg5YWQ1OWI0MjliYWY5YzFjOWM4OTljZjc5ZDY0OWRkMjllNDA5ZWFlOWYxZDlmOGI5ZmZhYTA2OWEwZDhhMTQ3YTFiNmEyMjZhMjk2YTMwNmEzNzZhM2U2YTQ1NmE0YzdhNTM4YTVhOWE2MWFhNjhiYTZmZGE3NmVhN2UwYTg1MmE4YzRhOTM3YTlhOWFhMWNhYThmYWIwMmFiNzVhYmU5YWM1Y2FjZDBhZDQ0YWRiOGFlMmRhZWExYWYxNmFmOGJiMDAwYjA3NWIwZWFiMTYwYjFkNmIyNGJiMmMyYjMzOGIzYWViNDI1YjQ5Y2I1MTNiNThhYjYwMWI2NzliNmYwYjc2OGI3ZTBiODU5YjhkMWI5NGFiOWMyYmEzYmJhYjViYjJlYmJhN2JjMjFiYzliYmQxNWJkOGZiZTBhYmU4NGJlZmZiZjdhYmZmNWMwNzBjMGVjYzE2N2MxZTNjMjVmYzJkYmMzNThjM2Q0YzQ1MWM0Y2VjNTRiYzVjOGM2NDZjNmMzYzc0MWM3YmZjODNkYzhiY2M5M2FjOWI5Y2EzOGNhYjdjYjM2Y2JiNmNjMzVjY2I1Y2QzNWNkYjVjZTM2Y2ViNmNmMzdjZmI4ZDAzOWQwYmFkMTNjZDFiZWQyM2ZkMmMxZDM0NGQzYzZkNDQ5ZDRjYmQ1NGVkNWQxZDY1NWQ2ZDhkNzVjZDdlMGQ4NjRkOGU4ZDk2Y2Q5ZjFkYTc2ZGFmYmRiODBkYzA1ZGM4YWRkMTBkZDk2ZGUxY2RlYTJkZjI5ZGZhZmUwMzZlMGJkZTE0NGUxY2NlMjUzZTJkYmUzNjNlM2ViZTQ3M2U0ZmNlNTg0ZTYwZGU2OTZlNzFmZTdhOWU4MzJlOGJjZTk0NmU5ZDBlYTViZWFlNWViNzBlYmZiZWM4NmVkMTFlZDljZWUyOGVlYjRlZjQwZWZjY2YwNThmMGU1ZjE3MmYxZmZmMjhjZjMxOWYzYTdmNDM0ZjRjMmY1NTBmNWRlZjY2ZGY2ZmJmNzhhZjgxOWY4YThmOTM4ZjljN2ZhNTdmYWU3ZmI3N2ZjMDdmYzk4ZmQyOWZkYmFmZTRiZmVkY2ZmNmRmZmZm";

mockRequire("../lib/postprocessing/image", async function(infile, outfile, instructions) {
    console.log('mocked image post processing', outfile, infile);
    if (instructions.shouldFail) {
        throw new Error('conversion using image processing lib (imagemagick) failed: Error!, code: 7, signal: null');
    }
    else if (instructions.fmt === 'jpg') {
        await fs.copyFile('test/files/generatedFileSmall.jpg',outfile);
    } else if (instructions.fmt === 'png') {
        await fs.copyFile('test/files/generatedFileSmall.png',outfile);
    } else if (instructions.fmt === 'tiff') {
        await fs.copyFile('test/files/generatedFileSmall.tiff',outfile);
    } else {
        throw new Error('unknown error');
    }
}
);
mockRequire.reRequire('../lib/worker'); // '../lib/postprocessing/image.js' is a dependency of lib/worker.js so it must be reloaded
mockRequire.reRequire('../lib/shell/shellscript');
const { worker, batchWorker, shellScriptWorker } = mockRequire.reRequire('../lib/api');

describe("imagePostProcess", () => {
    beforeEach(function () {
        process.env.ASSET_COMPUTE_SDK_DISABLE_CGROUP_METRICS = true;
        process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;
        process.env.DISABLE_IO_EVENTS_ON_TIMEOUT = true;
        process.env.OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION = true;
        process.env.__OW_DEADLINE = Date.now() + this.timeout();
        testUtil.beforeEach();

        mockFs.restore();
        process.env.WORKER_BASE_DIRECTORY = 'build/work';
    });

    afterEach(() => {
        testUtil.afterEach();
        delete process.env.WORKER_BASE_DIRECTORY;
    });

    after(() => {
        mockRequire.stop('../lib/postprocessing/image');
    });

    it('should convert PNG to JPG - end to end test', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = worker(workerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[0].metadata["tiff:imageWidth"], 10);
        assert.equal(events[0].metadata["tiff:imageHeight"], 6);
        assert.equal(events[0].metadata["dc:format"], "image/jpeg");
        
        const uploadedFileBase64 = Buffer.from(uploadedRenditions["/MyRendition.jpeg"]).toString('base64');
        
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64);

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[1].postProcessingDuration, receivedMetrics[1].processingDuration);
    });

    it('should fail if rendition failed in post processing - single rendition ', async () => {
        //batchworker single rendition post process eligible
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();

        // will use default image processing engine
        async function workerFn(source, rendition) {
            await fs.copyFile(source.path, rendition.path);
            rendition.postProcess = true;
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = worker(workerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpeg",
                shouldFail: true
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors);
        assert.ok(result.renditionErrors[0].message.includes('conversion using image processing lib (imagemagick) failed'));

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_failed");
        assert.equal(events[0].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "error");
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.ok(receivedMetrics[0].callbackProcessingDuration > 0, receivedMetrics[0].postProcessingDuration > 0, receivedMetrics[0].processingDuration > 0);
        assert.ok(receivedMetrics[1].callbackProcessingDuration > 0, receivedMetrics[1].postProcessingDuration > 0, receivedMetrics[1].processingDuration > 0);
    });

    it('should download source, invoke worker in batch callback and upload rendition - same rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        async function batchWorkerFn(source, renditions, outDirectory) {
            assert.equal(typeof source, "object");
            assert.equal(typeof source.path, "string");
            assert.ok(fs.existsSync(source.path));

            assert.ok(Array.isArray(renditions));
            assert.equal(renditions.length, 3);
            const rendition = renditions[0];
            assert.equal(typeof rendition.path, "string");
            assert.equal(typeof rendition.name, "string");
            assert.equal(typeof outDirectory, "string");
            assert.ok(fs.existsSync(outDirectory));
            assert.ok(fs.statSync(outDirectory).isDirectory());
            assert.ok(!fs.existsSync(rendition.path));

            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
            return Promise.resolve();
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition1.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition3.jpeg"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "jpg");

        const uploadedFileBase64_1 = Buffer.from(uploadedRenditions["/MyRendition1.jpeg"]).toString('base64');
        const uploadedFileBase64_2 = Buffer.from(uploadedRenditions["/MyRendition2.jpeg"]).toString('base64');
        const uploadedFileBase64_3 = Buffer.from(uploadedRenditions["/MyRendition3.jpeg"]).toString('base64');

        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_1);
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_2);
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_3);

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration, receivedMetrics[1].callbackProcessingDuration, receivedMetrics[2].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].callbackProcessingDuration + receivedMetrics[3].postProcessingDuration, receivedMetrics[3].processingDuration);
        assert.equal(receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration + receivedMetrics[2].postProcessingDuration, receivedMetrics[3].postProcessingDuration);
    });
    it('should download source, invoke worker in batch callback and upload rendition - different rendition', async () => {
        MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        async function batchWorkerFn(source, renditions, outDirectory) {
            assert.equal(typeof source, "object");
            assert.ok(Array.isArray(renditions));
            assert.equal(typeof outDirectory, "string");
            
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
            return Promise.resolve();
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "png",
                target: "https://example.com/MyRendition1.png"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            },{
                fmt: "tiff",
                target: "https://example.com/MyRendition3.tiff"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };
        process.env.ASSET_COMPUTE_NO_METADATA_IN_IMG = true;
        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "png");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "tiff");

        const uploadedFileBase64_png = Buffer.from(uploadedRenditions["/MyRendition1.png"]).toString('base64');
        const uploadedFileBase64_jpg = Buffer.from(uploadedRenditions["/MyRendition2.jpeg"]).toString('base64');
        const uploadedFileBase64_tiff = Buffer.from(uploadedRenditions["/MyRendition3.tiff"]).toString('base64');
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64_jpg);
        assert.ok(BASE64_RENDITION_PNG  === uploadedFileBase64_png);        
        assert.ok(BASE64_RENDITION_TIFF  === uploadedFileBase64_tiff);
    });
    
    it('should fail rendition only for failed post processing but success for others - multiple rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition1.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition3.jpeg",
                shouldFail: true
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors);
        assert.ok(result.renditionErrors[0].message.includes('conversion using image processing lib (imagemagick) failed'));
        assert.equal(result.renditionErrors.length, 1);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "jpg");
        assert.equal(events[2].type, "rendition_failed");
        assert.equal(events[2].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[2].eventType, "error");
        assert.equal(receivedMetrics[2].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].postProcessingDuration, receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration
                                + receivedMetrics[2].postProcessingDuration);
    });
    it('should post process eligible rendition and skip others - multiple rendition', async () => {
        //batchworker multiple rendition not all post process eligible
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition1.jpeg"
            },{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
            },{
                fmt: "jpg",
                target: "https://example.com/MyRendition3.jpeg"
            },],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 3);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "pdf");
        assert.equal(events[2].type, "rendition_created");
        assert.equal(events[2].rendition.fmt, "jpg");

        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[1].postProcessingDuration, receivedMetrics[1].processingDuration);
        assert.equal(receivedMetrics[3].eventType, "activation");
        assert.equal(receivedMetrics[3].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[3].postProcessingDuration, receivedMetrics[0].postProcessingDuration + receivedMetrics[1].postProcessingDuration
                            + receivedMetrics[2].postProcessingDuration);
    });
    
    it('should generate rendition if only one post processing ineligible rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "pdf",
                target: "https://example.com/MyRendition2.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "pdf");
        
        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[1].postProcessingDuration, receivedMetrics[0].postProcessingDuration);
        assert.equal(receivedMetrics[1].processingDuration, receivedMetrics[0].processingDuration);
    });
    it('should generate rendition if only one post processing eligible rendition', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition2.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");
        
        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "activation");
        assert.equal(receivedMetrics[1].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
        assert.equal(receivedMetrics[1].postProcessingDuration, receivedMetrics[0].postProcessingDuration);
        assert.equal(receivedMetrics[1].processingDuration, receivedMetrics[0].processingDuration);
    });
    it('should generate rendition when all rendition are post processing ineligible', async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        testUtil.mockPutFiles('https://example.com');
        async function batchWorkerFn(source, renditions) {
            for (const rendition of renditions) {
                await fs.copyFile(source.path, rendition.path);
                rendition.postProcess = true;
            }
        }

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const main = batchWorker(batchWorkerFn);
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
            },{
                fmt: "pdf",
                target: "https://example.com/PostProcessIneligible.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate errors
        
        assert.ok(result.renditionErrors === undefined);

        assert.equal(events.length, 2);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "pdf");
        assert.equal(events[1].type, "rendition_created");
        assert.equal(events[1].rendition.fmt, "pdf");
        
        // check metrics
        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 3);
        assert.equal(receivedMetrics[0].eventType, "rendition");
        assert.equal(receivedMetrics[0].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[1].eventType, "rendition");
        assert.equal(receivedMetrics[1].callbackProcessingDuration + receivedMetrics[0].postProcessingDuration, receivedMetrics[0].processingDuration);
        assert.equal(receivedMetrics[2].eventType, "activation");
        assert.equal(receivedMetrics[2].callbackProcessingDuration, receivedMetrics[0].callbackProcessingDuration);
    });

    it("should post process after shellScriptWorker()", async () => {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();
        const events = testUtil.mockIOEvents();
        const uploadedRenditions = testUtil.mockPutFiles('https://example.com');

        const script = `
        echo -n $source > $rendition
        echo '{ "postProcess": true }' > $optionsfile
        exit 0
        `;
        fs.writeFileSync("worker.sh", script);

        const main = shellScriptWorker();

        const base64PngFile = Buffer.from(fs.readFileSync(PNG_FILE)).toString('base64');
        const params = {
            source: `data:image/png;base64,${base64PngFile}`,
            renditions: [{
                fmt: "jpg",
                target: "https://example.com/MyRendition.jpeg"
            }],
            requestId: "test-request-id",
            auth: testUtil.PARAMS_AUTH,
            newRelicEventsURL: MetricsTestHelper.MOCK_URL,
            newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
        };

        const result = await main(params);

        // validate no errors
        assert.ok(result.renditionErrors === undefined);

        const uploadedFileBase64 = Buffer.from(uploadedRenditions["/MyRendition.jpeg"]).toString('base64');
        assert.ok(BASE64_RENDITION_JPG  === uploadedFileBase64);

        assert.equal(events.length, 1);
        assert.equal(events[0].type, "rendition_created");
        assert.equal(events[0].rendition.fmt, "jpg");

        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 2);
        fs.removeSync("worker.sh");
    });
});
