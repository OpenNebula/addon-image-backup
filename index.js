var opennebula = require('opennebula');
var config = require('./config');
var one = new opennebula(config.user+':'+config.token, config.address);

one.getImages(function(err, images){
    if(err) return console.log(err);

    for(var key in images){
        var image = images[key];

        if(
            image.PERSISTENT === '1'
            && image.DATASTORE_ID === '1'
            && (image.TYPE === '0' || image.TYPE === '2')
            || image.PERSISTENT === '0'
            && image.TEMPLATE.BACKUP === 'YES'
        ){
            processImage(image, function(err, imageId, snapId, snapSrc, snapDst){
                if(err) return console.log(err);

                mkdir(snapDst);

                console.log('qemu-img convert -O qcow2 '+snapSrc+' '+snapDst);
            });
        }
    }
}, -2);

function processImage(image, callback){
    var imageId = parseInt(image.ID);
    var vmId = parseInt(image.VMS.ID);

    var path = image.SOURCE.split('/');
    var sourceName = path.pop();

    // not used images or non persistent
    if(!vmId || image.PERSISTENT === '0') {
        // image without snapshots
        if (!image.SNAPSHOTS) {
            return callback(null, imageId, snapId, image.SOURCE, config.backupDir+image.DATASTORE_ID+'/'+sourceName);
        }

        // image with snapshots
        var allSnaps = image.SNAPSHOTS.SNAPSHOT;
        var lastSnap = allSnaps.pop();
        var snapId = parseInt(lastSnap.ID) + 1;
        return callback(null, imageId, snapId, image.SOURCE + '.snap/' + snapId, config.backupDir+image.DATASTORE_ID+'/'+sourceName+'.snap/'+snapId);
    }

    // get VM details
    var vm = one.getVM(vmId);

    vm.info(function(err, data){
        if(err) return callback(err);

        if(data.VM.TEMPLATE.DISK.DISK_ID){
            var vmDiskId = parseInt(data.VM.TEMPLATE.DISK.DISK_ID);

            console.log('Disk snapshot', vmId, vmDiskId);
            return;
            return vm.createDiskSnapshot(vmDiskId, 'weekly-backup', function(err, snapId){
                if(err) return callback(err);

                callback(null, imageId, snapId, image.SOURCE+'.snap/'+snapId, config.backupDir+image.DATASTORE_ID+'/'+sourceName+'.snap/'+(snapId+1));
            });
        }

        for(key in data.VM.TEMPLATE.DISK){
            var disk = data.VM.TEMPLATE.DISK[key];
            var vmDiskId = parseInt(disk.DISK_ID);
            var vmImageId = parseInt(disk.IMAGE_ID);

            if(imageId === vmImageId) {
                console.log('Disk snapshot', vmId, vmDiskId);
                return;
                vm.createDiskSnapshot(vmDiskId, 'weekly-backup', function(err, snapId){
                    if(err) return callback(err);

                    callback(null, imageId, snapId, image.SOURCE+'.snap/'+snapId, config.backupDir+image.DATASTORE_ID+'/'+sourceName+'.snap/'+(snapId+1));
                });

                break;
            }
        }
    });
}

function mkdir(file){
    var path = file.split('/');
    path.pop();
    var dir = path.join('/');

    console.log('mkdir -p '+dir);
}