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

module.exports = {
    // XML-RPC API Configuration
    address: 'http://opennebula:2633/RPC2',
    user: 'oneadmin',
    token: 'someStrongPass',
    
    // Path to where to save backups on backup server
    backupDir: '/path/to/backup/dir/',
    
    // Path where external tmp snapshot will create on compute node
    // Have to be owned by oneadmin user
    backupTmpDir: '/path/to/backup/tmp/dir/',
    
    // IP address of backup server from which we run this script
    // Used only for netcat function
    backupServerIp: '192.168.2.8',
    
    // List of compute nodes in cluster.
    // Used for downloading persistent images not attached to any vm,
    // non-persistent images and deployments files
    // This have to be valid DNS names, which resolves to IPs
    // You should copy /etc/hosts from Front-end node
    bridgeList: ['node1', 'node2', 'node3'],

    // Libvirt hypervisor connection URI
    libvirtUri: 'qemu:///system',

    // force to use --quiesce option durring live snapshot
    // freeze filesystem using qemu-guest-agent
    // usefull if there is not enabled qemu-guest-agent directly on VM template, but system wide
    libvirtUseQuiesce: false,

    // calls virsh domfstrim before snapshot is create
    libvirtUseDomFsTrim: true
}
