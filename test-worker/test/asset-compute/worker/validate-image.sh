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

# run known imagemagick version from a docker image to support e.g. webp
IMAGEMAGICK_DOCKER=v4tech/imagemagick

function im_identify() {
    local file="${@: -1}"
    # file formats that aren't supported with older imagemagicks need to use a docker image with a newer imagemagick
    if [[ "$file" == *".webp" ]]; then
        # pipe image file using cat (last argument)
        # and replace last argument for identify with - to read from stdin
        cat $file | docker run --rm -i $IMAGEMAGICK_DOCKER identify "${@:1:$(($#-1))}" -
    else
        # but since it's 3x faster and doesn't create weird "socket hang up" issues
        # we try and stick to a local imagemagick as much as possible
        identify $@
    fi
}

# check for pixel equality with some slight accepted color value difference
# will exit with 1 if images differ
FUZZ="5%"

function im_compare() {
    # file formats that aren't supported with older imagemagicks need to use a docker image with a newer imagemagick
    if [[ "$2" == *".webp" ]]; then
        local mountA="-v $(dirname $1):/a"
        local mountB="-v $(dirname $2):/b"
        local fileA=/a/`basename $1`
        local fileB=/b/`basename $2`
        docker run --rm $mountA $mountB $IMAGEMAGICK_DOCKER compare -metric AE -fuzz $FUZZ "$fileA" "$fileB" null:
    else
        # locale imagemagick
        compare -metric AE -fuzz $FUZZ "$1" "$2" null:
    fi
}

function im_compare_diff() {
    # file formats that aren't supported with older imagemagicks need to use a docker image with a newer imagemagick
    if [[ "$2" == *".webp" ]]; then
        local mountA="-v $(dirname $1):/a"
        local mountB="-v $(dirname $2):/b"
        local mountOut="-v $(dirname $3):/out"
        local fileA=/a/`basename $1`
        local fileB=/b/`basename $2`
        local fileOut=/out/`basename $3`
        docker run --rm $mountA $mountB $mountOut $IMAGEMAGICK_DOCKER compare -fuzz $FUZZ "$fileA" "$fileB" "$fileOut"
    else
        # locale imagemagick
        compare -fuzz $FUZZ "$1" "$2" "$3"
    fi
}

################################################################################

# check for equal type
mimeTypeExpected=$(file -b --mime-type $1)
mimeTypeActual=$(file -b --mime-type $2)
if [[ "$mimeTypeActual" != "$mimeTypeExpected" ]]; then
    echo "Type not equal: $mimeTypeActual instead of expected $mimeTypeExpected"
    exit 2
fi

# compare for equal size
imgSizeExpected=$(im_identify -format "%wx%h" $1)
imgSizeActual=$(im_identify -format "%wx%h" $2)
if [[ "$imgSizeActual" != "$imgSizeExpected" ]]; then
    echo "Size not equal: $imgSizeActual instead of expected $imgSizeExpected"
    exit 3
fi

if ! im_compare "$1" "$2" ; then

    # generate diff image on error
    testCase=$(basename $(dirname $1))
    resultDir=$(dirname $(dirname $2))
    dir="$resultDir/failed/$testCase"
    mkdir -p "$dir"

    im_compare_diff "$1" "$2" "$dir/diff.png" || true

    exit 1
fi

# no newline after compare output
echo
