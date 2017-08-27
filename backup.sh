#!/usr/bin/env bash
echo "Backup images"
one-image-backup.js -vs

echo "Backup deployments - system datastores without non-persistent disks"
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/0/ /var/data/opennebula/0/
rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@node1.feldhost.cz:/var/lib/one/datastores/110/ /var/data/opennebula/110/
