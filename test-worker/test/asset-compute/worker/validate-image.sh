#!/bin/bash

# Copyright 2020 Adobe. All rights reserved.
# This file is licensed to you under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may obtain a copy
# of the License at http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed under
# the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
# OF ANY KIND, either express or implied. See the License for the specific language
# governing permissions and limitations under the License.

# exit when any command fails
set -e

# echo all commands for verbose logs
set -x

# check for equal type
mimeTypeExpected=$(file -b --mime-type $1)
mimeTypeActual=$(file -b --mime-type $2)
if [[ "$mimeTypeActual" != "$mimeTypeExpected" ]]; then
    echo "Type not equal: $mimeTypeActual instead of expected $mimeTypeExpected"
    exit 2
fi

# compare for equal size
imgSizeExpected=$(identify -format "%wx%h" $1)
imgSizeActual=$(identify -format "%wx%h" $2)
if [[ "$imgSizeActual" != "$imgSizeExpected" ]]; then
    echo "Size not equal: $imgSizeActual instead of expected $imgSizeExpected"
    exit 3
fi

# check for pixel equality with some slight accepted color value difference
# will exit with 1 if images differ
FUZZ="5%"
if ! compare -metric AE -fuzz $FUZZ $1 $2 null: ; then

    # generate diff image on error
    testCase=$(basename $(dirname $1))
    resultDir=$(dirname $(dirname $2))
    dir="$resultDir/failed/$testCase"
    mkdir -p "$dir"

    compare -fuzz $FUZZ "$1" "$2" "$dir/diff.png" || true

    exit 1
fi

# no newline after compare output
echo
