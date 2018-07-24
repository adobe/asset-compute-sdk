// our principles:
// - only problems, no syntax/stylistic related rules (done by extending from "eslint-config-problems")
// - do not force new EcmaScript features
//     + warn instead of error for improvements like "prefer-template"
//     + ignore if they depend on the situation or can make readability harder like "prefer-arrow-callback" or "object-shorthand"
module.exports = {
    "extends": "problems",
    "env": {
        "node": true
    },
    "rules": {
        "prefer-arrow-callback": 0,
        "prefer-template": 1,
        "object-shorthand": 0,

        // console.* is wanted in OpenWhisk actions
        "no-console": [0, {"allow": true}],

        "template-curly-spacing": [1, "never"],

        "no-else-return": 0
    }
};