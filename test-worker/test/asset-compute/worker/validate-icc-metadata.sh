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

# check that icc description is equal
expected=$(identify -verbose $1 | grep icc:description | sed -n 's/.*icc:description: \([^ ]*\).*/\1/p')
actual=$(identify -verbose $2 | grep icc:description | sed -n 's/.*icc:description: \([^ ]*\).*/\1/p')
echo "$actual"
if [[ "$actual" != "$expected" ]]; then
    echo "icc description not equal: $actual instead of expected $expected"
    exit 4
fi

# reuse basic image validation
"$(dirname $0)/../validate-image.sh" "$1" "$2"
