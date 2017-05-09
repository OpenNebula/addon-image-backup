const program = require('commander');
const readline = require('readline');
const opennebula = require('opennebula');
const fs = require('fs');
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
	
	// get images
	one.getImages(function(err, images){
	    if(err) return console.log(err);
	
	    for(var key in images){
	        var image = images[key];
	
	        if(image.DATASTORE_ID === '1'){
	            processImage(image, function(err, backupCmd){
	                if(err) return console.log(err);
	
					// dry run, just print out commands
					if(program.dryRun){
						return console.log(backupCmd.join("\n"));
					}
	                
	                for(key in backupCmd){
		                var cmd = backupCmd[key];
		                
		                if(program.verbose){
			                console.log('Run cmd: ' + cmd);
		                }
		                
		                var result = shell.exec(cmd);
		                
		                if(result.stderr){
			                process.exit(1);
		                }
		                
		                if(program.verbose){
			                console.log(result.stdout);
			            }
	                }
	            });
	        }
	    }
	}, -2);
}

function processImage(image, callback){
    var imageId = parseInt(image.ID);
    var vmId = parseInt(image.VMS.ID);

    // not used images or non persistent
    if(!vmId || image.PERSISTENT === '0') {
        // image without snapshots
        if (!image.SNAPSHOTS) {
	        var cmd = generateBackupCmd('standard', image, null);
            return callback(null, cmd);
        }

        // image with snapshots
        var allSnaps = image.SNAPSHOTS.SNAPSHOT;
        var lastSnap = allSnaps.pop();
        var snapId = parseInt(lastSnap.ID) + 1;
        
        var cmd = generateBackupCmd('snapshot', image, snapId);
        return callback(null, cmd);
    }

    // get VM details
    var vm = one.getVM(vmId);

    vm.info(function(err, data){
        if(err) return callback(err);

        if(data.VM.TEMPLATE.DISK.DISK_ID){
            var vmDiskId = parseInt(data.VM.TEMPLATE.DISK.DISK_ID);
			
			if(program.verbose || program.dryRun){
	            console.log('Create live snapshot of image %s attached to VM %s as disk %s', imageId, vmId, vmDiskId);
	        }
	        
	        if(program.dryRun){
	            return;
			}
			
            return vm.createDiskSnapshot(vmDiskId, 'weekly-backup', function(err, snapId){
                if(err) return callback(err);

                var cmd = generateBackupCmd('snapshotLive', image, snapId);
		        callback(null, cmd);
            });
        }

        for(key in data.VM.TEMPLATE.DISK){
            var disk = data.VM.TEMPLATE.DISK[key];
            var vmDiskId = parseInt(disk.DISK_ID);
            var vmImageId = parseInt(disk.IMAGE_ID);

            if(imageId === vmImageId) {
	         	if(program.verbose || program.dryRun){
	            	console.log('Create live snapshot of image %s attached to VM %s as disk %s', imageId, vmId, vmDiskId);
	            }
	            
                if(program.dryRun){
		            return;
				}
				
                vm.createDiskSnapshot(vmDiskId, 'weekly-backup', function(err, snapId){
                    if(err) return callback(err);

                    var cmd = generateBackupCmd('snapshotLive', image, snapId);
			        callback(null, cmd);
                });

                break;
            }
        }
    });
}

function generateBackupCmd(type, image, snapId)
{
	var srcPath, dstPath, mkDirPath;
	var cmd = [];
	
	var sourcePath = image.SOURCE.split('/');
    var sourceName = sourcePath.pop();
	
	switch(type){
		case 'snapshot':
			srcPath = image.SOURCE + '.snap/' + snapId;
			dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;
		
			// make dir
			mkDirPath = 'mkdir -p ' + dstPath + '.snap';
			if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);
			
			// backup
			cmd.push('qemu-img convert -O qcow2 ' + srcPath + ' ' + dstPath);
			cmd.push('ln -s ../' + sourceName + ' ' + dstPath + '.snap/0');
			cmd.push('ln -s 0 ' + dstPath + '.snap/' + snapId);
			break;
			
		case 'snapshotLive':
			srcPath = image.SOURCE + '.snap/' + snapId;
			dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;
		
			// make dir
			mkDirPath = 'mkdir -p ' + dstPath + '.snap';
			if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);
			
			// backup
			cmd.push('qemu-img convert -O qcow2 ' + srcPath + ' ' + dstPath);
			cmd.push('ln -s ../' + sourceName + ' ' + dstPath + '.snap/0');
			cmd.push('ln -s 0 ' + dstPath + '.snap/' + (snapId + 1));
			break;
			
		case 'standard':
			srcPath = image.SOURCE;
			dstPath = config.backupDir + image.DATASTORE_ID + '/' + sourceName;
		
			// make dir
			mkDirPath = 'mkdir -p ' + config.backupDir + image.DATASTORE_ID;
			if(!fs.existsSync(mkDirPath)) cmd.push(mkDirPath);
			
			// backup
			cmd.push('qemu-img convert -O qcow2 ' + srcPath + ' ' + dstPath);
			break;
	}
	
	return cmd;
}