# OpenNebula backup script for QCOW2 datastores

This repo content was removed due to [community changes made by opennebula systems](https://forum.opennebula.io/t/towards-a-stronger-opennebula-community/8506).

It is hosted on [our Gitlab](https://gitlab.feldhost.cz/feldhost-public/one-image-backup) now.

## Description

Purpose of this script is to backup OpenNebula datastores type of file (qcow2).
This script have to run on dedicated backup server.

It backups:
- non-persistent base images - those which are used to deploy non-persistent VMs
- persistent images with live snapshoting support
    - when image is attached to VM them live external snapshot is created
    - them image is copied using rsync to backup dir
    - at the end external snapshot is blockcommited back to original image and deleted
- system datastores with deployments files - without VM images, which are non-persistent ones

## How it works

![Flow diagram](https://gitlab.feldhost.cz/feldhost-public/one-image-backup/raw/master/images/how-it-works.png)

## Authors

* Leader: Kristián Feldsam (feldsam@feldhost.net)

## Support

[FeldHost™](https://www.feldhost.net/products/opennebula) offers design, implementation, operation and management of a cloud solution based on OpenNebula.


## Compatibility

This add-on is compatible with OpenNebula 5.0+, NodeJS 5.10.1+ and NPM 3.8.3+
