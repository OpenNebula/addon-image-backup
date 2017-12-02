# OpenNebula backup script for QCOW2 datastores

Purpose of this script is to backup OpenNebula datastores type of file (qcow2).
This script have to run on dedicated backup server.

It backups:
- non-persistent base images - those which are used to deploy non-persistent VMs
- persistent images with live snapshoting support
    - when image is attached to VM them live external snapshot is created
    - and image is copied using rsync to backup dir
    - at the end external snapshot is blockcommited back to original image and deleted
- system datastores with deployments files - without VM images, which are non-persistent ones

## Installation

### You need nodejs and npm installed on backup server

CentOS:
```
yum install epel-release
yum install nodejs npm
```

Ubuntu:
```
apt-get install nodejs
```

Nodejs have to by installed in `/usr/local/bin/node`. If is not, them just create symlink

```
ln -s /path/where/is/nodejs/bin /usr/local/bin/node
```

### Clone or download this repository and install dependencies

```
npm install
```

## Usage

### Configure

```
cp config.sample.js config.js
```

```
module.exports = {
    address: 'http://opennebula:2633/RPC2',     // Address to OpenNebula API
    user: 'oneadmin',                           // Admin username
    token: 'someStrongPass',                    // Admin password
    backupDir: '/path/to/backup/dir/',          // Path to backup dir on this server
    backupTmpDir: '/path/to/backup/tmp/dir/',   // Path where external tmp snapshot will create on compute node
    // List of compute nodes in cluster.
    // Used for downloading persistent images not attached to any vm,
    // non-persistent images and deployments files
    // This have to be valid DNS names, which resolves to IPs
    bridgeList: ['node1', 'node2', 'node3']
}
```

Configure password less SSH access to compute nodes as `oneadmin` user.
Basicly you just need copy ~/.ssh from frontend node.

### List of options

```
./one-image-backup.js -h

  Usage: one-image-backup [options]


  Options:

    -V, --version          output the version number
    -i --image <image_id>  image id if you need backup concrete image
    -D --deployments       backup also deployments files from system datastores
    -d --dry-run           dry run - not execute any commands, instead will be printed out
    -s --skip-question     skip question about executiong backup
    -v --verbose           enable verbose mode
    -h, --help             output usage information
```

### Dry run for test

```
./one-image-backup.js -dvD
```

### Prepared bash script

There is also prepared bash script `backup.sh` for use in cron.
Script run `one-image-backup` with `D v s` options.

```
D - backup deployments files
v - verbose - so you get report by email
s - skip confirmation question
```