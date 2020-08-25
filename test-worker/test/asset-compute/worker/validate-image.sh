#!/bin/bash

#
# ADOBE CONFIDENTIAL
# __________________
#
#  Copyright 2020 Adobe Systems Incorporated
#  All Rights Reserved.
#
# NOTICE:  All information contained herein is, and remains
# the property of Adobe Systems Incorporated and its suppliers,
# if any.  The intellectual and technical concepts contained
# herein are proprietary to Adobe Systems Incorporated and its
# suppliers and are protected by trade secret or copyright law.
# Dissemination of this information or reproduction of this material
# is strictly forbidden unless prior written permission is obtained
# from Adobe Systems Incorporated.
#

# echo all commands for verbose logs
set -x

# exit when any command fails
set -e

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
compare -metric AE -fuzz 5% $1 $2 null:

# no newline after compare output
echo
