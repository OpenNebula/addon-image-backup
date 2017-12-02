#!/usr/bin/env bash

BASEDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Backup images"
$BASEDIR/one-image-backup.js -Dvs
