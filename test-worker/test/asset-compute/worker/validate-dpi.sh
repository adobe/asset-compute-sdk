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