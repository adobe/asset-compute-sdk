#!/bin/bash

# exit when any command fails
set -e

# check for equal interlace
expected=$(identify -format "%[compression]" "$1")
actual=$(identify -format "%[compression]" "$2")
if [[ "$actual" != "$expected" ]]; then
    echo "interlace not equal: $actual instead of expected $expected"
    exit 4
fi

# reuse basic image validation
"$(dirname $0)/../validate-image.sh" "$1" "$2"
