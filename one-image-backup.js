#!/usr/local/bin/node

const program = require('commander');
const readline = require('readline');
const opennebula = require('opennebula');
const fs = require('fs');
const async = require('async');
const shell = require('shelljs');
const config = require('./config');
var one;

// define program
program
	.version('1.0.0')
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
            one.getImages(function(err, images) {
                if (err) return callback(err);

                callback(null, images);
            }, -2);
        }
    }, function(err, results) {
        // iterate over images
        for(var key in results.images){
            var image     = results.images[key];
            var datastore = results.datastores[image.DATASTORE_ID];

            // backup images only from type FS datastores
            if(datastore.TEMPLATE.TM_MAD === 'qcow2'){
                processImage(image, function(err, backupCmd){
                    if(err) return console.log(err);

                    // dry run, just print out commands
                    if(program.dryRun){
                        return console.log(backupCmd.join("\n"));
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
                });
            }
        }
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
            console.log('Backup non-persistent image %s named %s attached to VMs %s', imageId, image.NAME, image.VMS.ID.join(','));
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
            return backupUsedPersistentImage(image, imageId, vm, vmId, vm.TEMPLATE.DISK, function(err, data){
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
    var hostname = vmGetHostname(vm);

    if(program.verbose || program.dryRun){
        console.log('Create live snapshot of image %s named %s attached to VM %s as disk %s running on %s', imageId, image.NAME, vmId, disk.TARGET, hostname);
    }

    var cmd = generateBackupCmd('snapshotLive', image, vm, disk, excludedDisks);
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

            // backup
            cmd.push('rsync -avh -P oneadmin@' + hostname + ':' + image.SOURCE + ' ' + dstPath);
            cmd.push('rsync -avh -P oneadmin@' + hostname + ':' + srcPath + '/ ' + dstPath + '.snap/');
			break;
			
        case 'snapshotLive':
		    var tmpDiskSnapshot = '/var/lib/one/datastores/snapshots/one-' + vm.ID + '-weekly-backup';

		    // excluded disks
            var excludedDiskSpec = '';
            for(var key in excludedDisks){
                var excludedDisk = excludedDisks[key];

                excludedDiskSpec += ' --diskspec ' + excludedDisk + ',snapshot=no';
            }

		    // create tmp snapshot file
		    cmd.push('ssh oneadmin@' + hostname + ' \'touch ' + tmpDiskSnapshot + '\'');
		    cmd.push('ssh oneadmin@' + hostname + ' \'virsh -c qemu+tcp://localhost/system snapshot-create-as --domain one-' + vm.ID + ' weekly-backup' + excludedDiskSpec + ' --diskspec ' + disk.TARGET + ',file=' + tmpDiskSnapshot + ' --disk-only --atomic --no-metadata\'');

		    // set src and dest paths
			srcPath = image.SOURCE + '.snap';
			dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;

			// make dest dir
			mkDirPath = 'mkdir -p ' + dstPath + '.snap';
			if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);

			// backup
			cmd.push('rsync -avh -P oneadmin@' + hostname + ':' + image.SOURCE + ' ' + dstPath);
            cmd.push('rsync -avh -P oneadmin@' + hostname + ':' + srcPath + '/ ' + dstPath + '.snap/');

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