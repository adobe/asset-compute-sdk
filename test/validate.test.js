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

const assert = require('assert');

const { validateParameters, validateRendition, validateWatermark } = require('../lib/validate');

function assertValidateThrows(params, name="GenericError", message) {
    const expectedError = {};
    if (name) {
        expectedError.name = name;
    }
    if (message) {
        expectedError.message = message;
    }
    assert.throws(() => {
        validateParameters(params);
    }, expectedError);
}

const INVALID_URLS = [
    "not-a-url",
    "../../file/path",
    "ftp://server.com/source.jpg",
    "htp://www.adobe.com",
    "http//www.adobe.com",
    "",
    "   ",
    "\n"
];

describe('validate.js', () => {
    beforeEach(() => {
        process.env.__OW_ACTION_NAME = 'test_action_validation';
    });

    afterEach(() => {
        delete process.env.WORKER_TEST_MODE;
    });

    it('validates a rendition', () => {
        const rendition = {
            target: "https://example.com/image.jpg"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "https://example.com/image.jpg");
    });

    it('sets renditions target properly when a url is entered', () => {
        const rendition = {
            url: "https://example.com/image.jpg"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "https://example.com/image.jpg");
    });

    it('sets renditions target properly when a target and a url is entered (target takes precedence)', () => {
        const rendition = {
            url: "https://example.com/INCORRECT.jpg",
            target: "https://example.com/image.jpg"
        };

        validateRendition(rendition);
        assert.equal(rendition.target, "https://example.com/image.jpg");
    });

    it('throws if a rendition has no target and no url', () => {
        let rendition = {
            nothing: "nothing"
        };
        assert.throws(() => {
            validateRendition(rendition);
        });

        rendition = {
            target: 42
        };
        assert.throws(() => {
            validateRendition(rendition);
        });

        rendition = {
            url: 42
        };
        assert.throws(() => {
            validateRendition(rendition);
        });

        rendition = {
            url: null
        };
        assert.throws(() => {
            validateRendition(rendition);
        });
    });

    it('normalizes the source url param', () => {
        const paramsToValidate = {
            source: "https://example.com/image.jpg",
            renditions: [
                {
                    target: "https://example.com/target.jpg"
                },
                {
                    target: "https://example.com/target2.jpg"
                }
            ]
        };

        validateParameters(paramsToValidate);
        assert.equal(typeof paramsToValidate.source, "object");
        assert.equal(paramsToValidate.source.url, "https://example.com/image.jpg");
    });

    it('validates parameters - source is a data uri', () => {
        const paramsToValidate = {
            source: "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=",
            renditions: [
                {
                    target: "https://example.com/target.jpg"
                },
                {
                    target: "https://example.com/target2.jpg"
                }
            ]
        };

        validateParameters(paramsToValidate);
        assert.equal(typeof paramsToValidate.source, "object");
        assert.equal(paramsToValidate.source.url, "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=");
    });

    it('validates parameters - watermark is a data uri', () => {
        const paramsToValidate = {
            watermarkContent: "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo="
        };

        validateWatermark(paramsToValidate);
        assert.equal(typeof paramsToValidate, "object");
        assert.equal(paramsToValidate.watermarkContent, "data:text/html;base64,PHA+VGhpcyBpcyBteSBjb250ZW50IGZyYWdtZW50LiBXaGF0J3MgZ29pbmcgb24/PC9wPgo=");
    });

    it('throws if source is an invalid data uri', () => {
        const paramsToValidate = {
            source: "data:",
            renditions: [
                {
                    target: "https://example.com/target.jpg"
                },
                {
                    target: "https://example.com/target2.jpg"
                }
            ]
        };
        assertValidateThrows(paramsToValidate, "SourceCorruptError", "Invalid or missing data url data:");
    });

    it('throws if watermark is an invalid data uri', () => {
        const expectedError = {
            name: "RenditionFormatUnsupportedError",
            message: "Invalid or missing data url for watermark data:"
        }
        const paramsToValidate = {
            watermarkContent: "data:"
        };

        assert.throws(() => {
            validateWatermark(paramsToValidate);
        }, expectedError);
    });

    it('verifies renditions is an array (1 element)', () => {
        const paramsToValidate = {
            source: "https://example.com/image.jpg",
            renditions: [
                {
                    target: "https://example.com/target.jpg"
                }
            ]
        };

        validateParameters(paramsToValidate);

        // verify array did not change size
        assert.equal(paramsToValidate.renditions.length, 1);
    });

    it('verifies renditions is an array (many elements)', () => {
        const paramsToValidate = {
            source: "https://example.com/image.jpg",
            renditions: [
                {
                    target: "https://example.com/target.jpg"
                },
                {
                    target: "https://example.com/target2.jpg"
                },
                {
                    target: "https://example.com/target3.jpg"
                }
            ]
        };

        validateParameters(paramsToValidate);

        // verify array did not change size
        assert.equal(paramsToValidate.renditions.length, 3);

        // verify order did not change
        assert.equal(paramsToValidate.renditions[0].target, "https://example.com/target.jpg");
        assert.equal(paramsToValidate.renditions[1].target, "https://example.com/target2.jpg");
        assert.equal(paramsToValidate.renditions[2].target, "https://example.com/target3.jpg");
    });

    it('verifies if renditions has a multipart target', () => {
        const params = {
            source: "https://example.com/image.jpg",
            renditions: [{
                target: {
                    minPartSize: 10485760,
                    maxPartSize: 104857600,
                    urls: [
                        "https://example.com/target.jpg",
                        "https://example.com/target2.jpg"
                    ]
                }
            }]
        };

        validateParameters(params);

        assert.equal(params.renditions.length, 1);
        assert.deepStrictEqual(params.renditions[0].target, {
            minPartSize: 10485760,
            maxPartSize: 104857600,
            urls: [
                "https://example.com/target.jpg",
                "https://example.com/target2.jpg"
            ]
        });
    });

    it('throws if rendition array is empty', () => {
        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: []
        },
        "GenericError",
        "'renditions' array is empty."
        );

        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [null, null]
        },
        "GenericError",
        "'renditions' array is empty."
        );
    });

    it('throws if rendition is not an array', () => {
        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: "rendition-array"
        },
        "GenericError",
        "'renditions' is not an array."
        );

        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: {}
        },
        "GenericError",
        "'renditions' is not an array."
        );
    });

    it('throws if source is not a valid url', () => {
        for (const invalidUrl of INVALID_URLS) {
            assertValidateThrows({
                source: invalidUrl,
                renditions: [{
                    target: "https://example.com/target.jpg"
                }]
            },
            "SourceUnsupportedError"
            );

            assertValidateThrows({
                source: {
                    url: invalidUrl
                },
                renditions: [{
                    target: "https://example.com/target.jpg"
                }]
            },
            "SourceUnsupportedError"
            );
        }
    });

    it('throws if watermark is not a valid url', () => {
        const expectedError = {
            name: "RenditionFormatUnsupportedError"
        };

        for (const invalidUrl of INVALID_URLS) {

            assert.throws(() => {
                validateWatermark({ watermarkContent: invalidUrl });
            }, expectedError);
        }
    });

    it('throws if source is a http url', () => {
        assertValidateThrows({
            source: "http://example.com/NOT_HTTPS",
            renditions: [{
                target: "https://example.com/target.jpg"
            }]
        },
        "SourceUnsupportedError"
        );

        assertValidateThrows({
            source: {
                url: "http://example.com/NOT_HTTPS"
            },
            renditions: [{
                target: "https://example.com/target.jpg"
            }]
        },
        "SourceUnsupportedError"
        );
    });

    it('throws if watermark is an http url', () => {

        const expectedError = {
            name: "RenditionFormatUnsupportedError"
        };

        assert.throws(() => {
            validateWatermark({ watermarkContent: "http://example.com/NOT_HTTPS" });
        }, expectedError);
    });

    it('throws if rendition.target or rendition.url is not a valid url', () => {
        for (const invalidUrl of INVALID_URLS) {
            assertValidateThrows({
                source: "https://example.com/image.jpg",
                renditions: [{
                    target: invalidUrl
                }]
            });

            assertValidateThrows({
                source: "https://example.com/image.jpg",
                renditions: [{
                    url: invalidUrl
                }]
            });
        }
    });

    it('throws if rendition.target or rendition.url is http url', () => {
        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [{
                target: "http://example.com/NOT_HTTPS"
            }]
        },
        "GenericError"
        );

        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [{
                url: "http://example.com/NOT_HTTPS"
            }]
        },
        "GenericError"
        );
    });

    it('throws if rendition.target.urls or rendition.url contains invalid url', () => {
        for (const invalidUrl of INVALID_URLS) {
            assertValidateThrows({
                source: "https://example.com/image.jpg",
                renditions: [{
                    target: {
                        urls: [
                            invalidUrl,
                            "https://example.com/target.jpg"
                        ]
                    }
                }]
            },
            "GenericError"
            );

            assertValidateThrows({
                source: "https://example.com/image.jpg",
                renditions: [{
                    target: {
                        urls: [
                            "https://example.com/target.jpg",
                            invalidUrl,
                            "https://example.com/target2.jpg"
                        ]
                    }
                }]
            },
            "GenericError"
            );

            assertValidateThrows({
                source: "https://example.com/image.jpg",
                renditions: [{
                    target: {
                        urls: [
                            "https://example.com/target.jpg",
                            "https://example.com/target2.jpg",
                            invalidUrl
                        ]
                    }
                }]
            },
            "GenericError"
            );
        }
    });
    it('throws if rendition.target.urls or rendition.url contains http url', () => {
        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [{
                target: {
                    urls: [
                        "http://example.com/NOT_HTTPS",
                        "https://example.com/target.jpg"
                    ]
                }
            }]
        },
        "GenericError"
        );

        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [{
                target: {
                    urls: [
                        "https://example.com/target.jpg",
                        "http://example.com/NOT_HTTPS",
                        "https://example.com/target2.jpg"
                    ]
                }
            }]
        },
        "GenericError"
        );

        assertValidateThrows({
            source: "https://example.com/image.jpg",
            renditions: [{
                target: {
                    urls: [
                        "https://example.com/target.jpg",
                        "https://example.com/target2.jpg",
                        "http://example.com/NOT_HTTPS"
                    ]
                }
            }]
        },
        "GenericError"
        );
    });

    it('allows file paths if WORKER_TEST_MODE env var is set', () => {
        process.env.WORKER_TEST_MODE = true;
        const params = {
            source: "source.jpg",
            renditions: [
                {
                    fmt: "png"
                },
                {
                    fmt: "xml"
                }
            ]
        };

        validateParameters(params);
        assert.equal(typeof params.source, "object");
        assert.equal(params.source.url, "source.jpg");
        assert.equal(params.renditions.length, 2);
    });

    it('allows file paths if WORKER_TEST_MODE env var is set - watermark', () => {
        process.env.WORKER_TEST_MODE = true;
        const params = { watermarkContent: "watermark.png" };

        validateWatermark(params);
        assert.equal(typeof params, "object");
        assert.equal(params.watermarkContent, "watermark.png");
    });
});
