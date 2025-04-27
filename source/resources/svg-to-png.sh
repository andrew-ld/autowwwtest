#!/bin/bash

set -xe

RESOLUTIONS=("16" "32" "48" "96" "128")

for resolution in ${RESOLUTIONS[@]}; do
    convert -background none -resize ${resolution}x${resolution} autowwwtest.svg autowwwtest-${resolution}.png
done
