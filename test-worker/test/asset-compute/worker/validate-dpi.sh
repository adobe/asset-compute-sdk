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

$(dirname $0)/../validate-image.sh $1 $2

# check for equal dpi
imgDpiExpected=$(identify -format "%x x %y" $1)
imgDpiActual=$(identify -format "%x x %y" $2)
if [[ "$imgDpiActual" != "$imgDpiExpected" ]]; then
    echo "dpi not equal: $imgDpiActual instead of expected $imgDpiExpected"
    exit 4
fi
