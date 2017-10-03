#!/usr/bin/env bash

BASEDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "Backup images"
$BASEDIR/one-image-backup.js -vs

if [ $? -ne 0 ]; then
    exit 1
fi

echo "Backup deployments - system datastores without non-persistent disks"
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/0/ /var/data/opennebula/0/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/110/ /var/data/opennebula/110/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/112/ /var/data/opennebula/112/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/114/ /var/data/opennebula/114/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/116/ /var/data/opennebula/116/
