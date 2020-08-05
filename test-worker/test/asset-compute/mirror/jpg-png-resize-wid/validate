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

set -x

filename=$(basename "$1")
TYPE=`echo  ${filename##*.} | tr '[a-z]' '[A-Z]'`

# Ensure that we have latest version
docker pull docker-project-nui-snapshot.dr.corp.adobe.com/nui/imgtools 

docker run --rm -v `dirname $1`:/a -v `dirname $2`:/b docker-project-nui-snapshot.dr.corp.adobe.com/nui/imgtools ImageValidate /a/`basename $1` /b/`basename $2` $TYPE