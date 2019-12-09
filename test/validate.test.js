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

/* eslint-env mocha */
/* eslint mocha/no-mocha-arrows: "off" */

'use strict';

const assert = require('assert');

const { validateParameters, validateRendition } = require('../lib/validate');

function assertValidateThrows(params, name="GenericError", message) {
    const expectedError = {}
    if (name) {
        expectedError.name = name;
    }
    if (message) {
        expectedError.message = message;
    }
    assert.throws(() => {
        validateParameters(params)
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
            validateRendition(rendition)
        });

        rendition = {
            target: 42
        };
        assert.throws(() => {
            validateRendition(rendition)
        });

        rendition = {
            url: 42
        };
        assert.throws(() => {
            validateRendition(rendition)
        });

        rendition = {
            url: null
        };
        assert.throws(() => {
            validateRendition(rendition)
        });
    });

    it('throws when params.source is undefined or null', () => {
        assertValidateThrows({},
            "GenericError",
            "No 'source' in params. Required for asset workers."
        );

        assertValidateThrows({
                source: null
            },
            "GenericError",
            "No 'source' in params. Required for asset workers."
        );
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
        assert.deepEqual(params.renditions[0].target, {
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

});