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

# verify that it did not run post processing

# normally this should work: "identify -format %c $2"
# but for some reason %c does not work with PNG files, while -verbose lists the comment
comment=$(identify -verbose $2 | grep comment | sed -E 's/[[:space:]]+comment: (.*)/\1/')
if [[ $comment == "Generated by Adobe Asset Compute SDK post-processing." ]]; then
    # contains = failure (since we expect it to not run here)
    exit 5
fi

# reuse basic image validation
"$(dirname $0)/../validate-image.sh" "$1" "$2"
