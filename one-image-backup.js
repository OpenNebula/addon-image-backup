#!/usr/local/bin/node

/*
# -------------------------------------------------------------------------- #
# Copyright 2017, FELDSAM s.r.o - FeldHost™, Kristián Feldsam                #
#                                                                            #
# Licensed under the Apache License, Version 2.0 (the "License"); you may    #
# not use this file except in compliance with the License. You may obtain    #
# a copy of the License at                                                   #
#                                                                            #
# http://www.apache.org/licenses/LICENSE-2.0                                 #
#                                                                            #
# Unless required by applicable law or agreed to in writing, software        #
# distributed under the License is distributed on an "AS IS" BASIS,          #
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.   #
# See the License for the specific language governing permissions and        #
# limitations under the License.                                             #
#--------------------------------------------------------------------------- #
*/

const program = require('commander');
const readline = require('readline');
const opennebula = require('opennebula');
const fs = require('fs');
const async = require('async');
const shell = require('shelljs');
const dateTime = require('node-datetime');
const config = require('./config');
var one;

// define program
program
	.version('1.0.2')
    .option('-i --image <image_id>', 'image id if you need backup concrete image', parseInt)
    .option('-D --deployments', 'backup also deployments files from system datastores')
	.option('-d --dry-run', 'dry run - not execute any commands, instead will be printed out')
	.option('-s --skip-question', 'skip question about executiong backup')
	.option('-v --verbose', 'enable verbose mode')
	.parse(process.argv);

// really want to execute backup?
if(!program.dryRun && !program.skipQuestion){
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	
	rl.question('Do you really want execute backup? If not, use --dry-run option (yes/no) [no]: ', function(answer){
		rl.close();
		
		if(answer === 'yes'){
			main();
		}
	});
}
else
{
	// dry run or skip question
	main();
}

function main(){
	// connect to one
	one = new opennebula(config.user+':'+config.token, config.address);

    async.parallel({
        datastores: function(callback) {
            one.getDatastores(function(err, datastores) {
                if (err) return callback(err);

                var result = {};

                for(var key in datastores){
                    var ds = datastores[key];
                    result[ds.ID] = ds;
                }

                callback(null, result);
            }, -2);
        },
        images: function(callback) {
            if( ! isNaN(program.image)) {
                var i = one.getImage(program.image);
                return i.info(function(err, image) {
                    if (err) return callback(err);

                    callback(null, [image.IMAGE]);
                });
            }

            one.getImages(function(err, images) {
                if (err) return callback(err);

                callback(null, images);
            }, -2);
        }
    }, function(err, results) {
        // iterate over images
        async.eachSeries(results.images, function(image, callback){
            var datastore = results.datastores[image.DATASTORE_ID];

            // backup images only from type FS datastores
            if(datastore.TEMPLATE.TM_MAD === 'qcow2') {
                return async.series([
                    function(callback) {
                        // Update image template with info about backup is started
                        var imageRsrc = one.getImage(parseInt(image.ID));
                        imageRsrc.update('BACKUP_IN_PROGRESS=YES BACKUP_FINISHED_UNIX=--- BACKUP_FINISHED_HUMAN=--- BACKUP_STARTED_UNIX=' + Math.floor(Date.now() / 1000) + ' BACKUP_STARTED_HUMAN="' + dateTime.create().format('Y-m-d H:M:S') + '"', 1, callback);
                    },
                    function(callback) {
                        processImage(image, function(err, backupCmd){
                            if(err) {
                                return callback(err);
                            }

                            // dry run, just print out commands
                            if(program.dryRun){
                                console.log(backupCmd.join("\n"));
                                return callback(null);
                            }

                            for(var cmdKey in backupCmd){
                                var cmd = backupCmd[cmdKey];
                                var options = {silent : true};

                                if(program.verbose){
                                    console.log('Run cmd: ' + cmd);
                                    var options = {silent : false};
                                }

                                var result = shell.exec(cmd, options);

                                if(result.code !== 0){
                                    process.exit(1);
                                }
                            }

                            callback(null);
                        });
                    },
                    function(callback){
                        // Update image template with info about backup is finished
                        var imageRsrc = one.getImage(parseInt(image.ID));
                        imageRsrc.update('BACKUP_IN_PROGRESS=NO BACKUP_FINISHED_UNIX=' + Math.floor(Date.now() / 1000) + ' BACKUP_FINISHED_HUMAN="' + dateTime.create().format('Y-m-d H:M:S') + '"', 1, callback);
                    }
                ], callback);
            }

            // skip
            callback(null);
        }, function (err) {
            if(err) {
                process.exit(1);
            }

            // backup deployments files from system DS
            if(program.deployments) {
                var options = {silent : true};

                if(program.verbose) {
                    console.log('Backup deployments - system datastores without non-persistent disks...');
                }

                for(var key in results.datastores) {
                    var datastore = results.datastores[key];

                    // filter just system datastores with TM_MAD == qcow2
                    if(datastore.TYPE !== '1' || datastore.TEMPLATE.TM_MAD !== 'qcow2') {
                        continue;
                    }

                    // get random host form bridge list
                    var hostname = config.bridgeList[Math.floor(Math.random()*config.bridgeList.length)];

                    // create backup command
                    var cmd = 'rsync -avhP --delete --exclude "disk.0.snap/0" oneadmin@' + hostname + ':' + datastore.BASE_PATH + '/ ' + config.backupDir + '/' + datastore.ID + '/';

                    // dry run, just print out command
                    if(program.dryRun){
                        console.log(cmd);
                        continue;
                    }

                    // setup verbosity and print command
                    if(program.verbose) {
                        console.log('Run cmd: ' + cmd);
                        var options = {silent: false};
                    }

                    // run command
                    var result = shell.exec(cmd, options);

                    if(result.code !== 0){
                        process.exit(1);
                    }
                }
            }
        });
    });
}

function processImage(image, callback){
    var imageId = parseInt(image.ID);
    var vmId = parseInt(image.VMS.ID);

    // not used images or non persistent
    if(!vmId || image.PERSISTENT === '0') {
        if(!vmId && (program.verbose || program.dryRun)){
            console.log('Backup not used image %s named %s', imageId, image.NAME);
        }

        if(vmId && image.PERSISTENT === '0' && (program.verbose || program.dryRun)){
            if(image.VMS.ID instanceof Array) {
                var vms = image.VMS.ID.join(',');
            } else {
                var vms = image.VMS.ID;
            }

            console.log('Backup non-persistent image %s named %s attached to VMs %s', imageId, image.NAME, vms);
        }

        var cmd = generateBackupCmd('standard', image);
        return callback(null, cmd);
    }

    // get VM details
    var vm = one.getVM(vmId);

    vm.info(function(err, data){
        if(err) return callback(err);

        var vm = data.VM;

        if(vm.TEMPLATE.DISK.DISK_ID){
            return backupUsedPersistentImage(image, imageId, vm, vmId, vm.TEMPLATE.DISK, [], function(err, data){
                if(err) return callback(err);

                callback(null, data);
            });
        }

        var excludedDisks = [];

        for(key in vm.TEMPLATE.DISK){
            var disk = vm.TEMPLATE.DISK[key];
            var vmImageId = parseInt(disk.IMAGE_ID);

            if(imageId === vmImageId) {
                vmDisk = disk;
            } else {
                excludedDisks.push(disk.TARGET);
            }
        }

        backupUsedPersistentImage(image, imageId, vm, vmId, vmDisk, excludedDisks, function(err, data){
            if(err) return callback(err);

            callback(null, data);
        });
    });
}

function backupUsedPersistentImage(image, imageId, vm, vmId, disk, excludedDisks, callback){
    var active   = true;
    var hostname = vmGetHostname(vm);

    // if VM is not in state ACTIVE
    if(vm.STATE !== '3'){
        active = false;
    }

    // console logs
    if(program.verbose || program.dryRun){
        if(active) {
            console.log('Create live snapshot of image %s named %s attached to VM %s as disk %s running on %s', imageId, image.NAME, vmId, disk.TARGET, hostname);
        } else {
            console.log('Backup used image %s named %s attached to VM %s as disk %s, but not in active state (STATE: %s, LCM_STATE: %s) on %s', imageId, image.NAME, vmId, disk.TARGET, vm.STATE, vm.LCM_STATE, hostname);
        }
    }

    // backup commands generation
    if(active) {
        var cmd = generateBackupCmd('snapshotLive', image, vm, disk, excludedDisks);
    } else {
        var cmd = generateBackupCmd('standard', image);
    }

    callback(null, cmd);
}

function generateBackupCmd(type, image, vm, disk, excludedDisks)
{
	var srcPath, dstPath, mkDirPath;
	var cmd = [];
	
	var sourcePath = image.SOURCE.split('/');
    var sourceName = sourcePath.pop();
    var hostname   = vmGetHostname(vm);
	
	switch(type){
		case 'standard':
            // set src and dest paths
            srcPath = image.SOURCE + '.snap';
            dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;

            // make dest dir
            mkDirPath = 'mkdir -p ' + dstPath + '.snap';
            if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);

            // backup image
            cmd.push('rsync -avhW -P oneadmin@' + hostname + ':' + image.SOURCE + ' ' + dstPath);
            // create source snap dir if not exists
            cmd.push('ssh oneadmin@' + hostname + ' \'[ -d ' + srcPath + ' ] || mkdir ' + srcPath + '\'');
            // backup snap dir
            cmd.push('rsync -avhW -P oneadmin@' + hostname + ':' + srcPath + '/ ' + dstPath + '.snap/');
			break;
			
        case 'snapshotLive':
		    var tmpDiskSnapshot = config.backupTmpDir + 'one-' + vm.ID + '-weekly-backup';

		    // excluded disks
            var excludedDiskSpec = '';
            for(var key in excludedDisks){
                var excludedDisk = excludedDisks[key];

                excludedDiskSpec += ' --diskspec ' + excludedDisk + ',snapshot=no';
            }

		    // create tmp snapshot file
		    cmd.push('ssh oneadmin@' + hostname + ' \'touch ' + tmpDiskSnapshot + '\'');
            var liveSnapshotCmd = 'ssh oneadmin@' + hostname + ' \'virsh -c qemu+tcp://localhost/system snapshot-create-as --domain one-' + vm.ID + ' weekly-backup' + excludedDiskSpec + ' --diskspec ' + disk.TARGET + ',file=' + tmpDiskSnapshot + ' --disk-only --atomic --no-metadata';

            // try to freeze fs if guest agent enabled
            if(vm.TEMPLATE.FEATURES !== undefined && vm.TEMPLATE.FEATURES.GUEST_AGENT !== undefined && vm.TEMPLATE.FEATURES.GUEST_AGENT === 'yes') {
                cmd.push(liveSnapshotCmd + ' --quiesce\' || ' + liveSnapshotCmd + '\'');

            } else {
                cmd.push(liveSnapshotCmd + '\'');
            }

		    // set src and dest paths
			srcPath = image.SOURCE + '.snap';
			dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;

			// make dest dir
			mkDirPath = 'mkdir -p ' + dstPath + '.snap';
			if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);

			// backup image
			cmd.push('rsync -aHAXxWv --numeric-ids --progress -e "ssh -T -c arcfour128 -o Compression=no -x" oneadmin@' + hostname + ':' + image.SOURCE + ' ' + dstPath);
			// create source snap dir if not exists
			cmd.push('ssh oneadmin@' + hostname + ' \'[ -d ' + srcPath + ' ] || mkdir ' + srcPath + '\'');
			// backup snap dir
            cmd.push('rsync -aHAXxWv --numeric-ids --progress -e "ssh -T -c arcfour128 -o Compression=no -x" oneadmin@' + hostname + ':' + srcPath + '/ ' + dstPath + '.snap/');

			// blockcommit tmp snapshot to original one
            cmd.push('ssh oneadmin@' + hostname + ' \'virsh -c qemu+tcp://localhost/system blockcommit one-' + vm.ID + ' ' + disk.TARGET + ' --active --pivot --shallow --verbose\'');

			// clear tmp snapshot
            cmd.push('ssh oneadmin@' + hostname + ' \'rm -f ' + tmpDiskSnapshot + '\'');
			break;
	}
	
	return cmd;
}

function vmGetHostname(vm){
    if(!vm){
        return config.bridgeList[Math.floor(Math.random()*config.bridgeList.length)];
    }

    if(vm.HISTORY_RECORDS.HISTORY.HOSTNAME){
        return vm.HISTORY_RECORDS.HISTORY.HOSTNAME;
    }

    var history = JSON.parse(JSON.stringify(vm.HISTORY_RECORDS.HISTORY));

    return history.pop().HOSTNAME;
}