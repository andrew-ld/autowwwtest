#!/bin/bash

set -xe

tmpdir=$(mktemp -d)

function cleanup() {
    rm -rf "$tmpdir"
}

trap cleanup EXIT

docker buildx build --output type=local,dest="$tmpdir" --progress plain .

pushd "$tmpdir"
zip -r autowwwleak.zip .
popd

cp "$tmpdir"/autowwwleak.zip .
