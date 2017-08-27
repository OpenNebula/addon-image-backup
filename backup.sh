#!/usr/bin/env bash

BASEDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Backup images"
$BASEDIR/one-image-backup.js -vs

echo "Backup deployments - system datastores without non-persistent disks"
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/0/ /var/data/opennebula/0/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/110/ /var/data/opennebula/110/
