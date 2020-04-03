const fs = require('fs');
const nodePath = require('path');
const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const usbDetect = require('usb-detection');
const drivelist = require('drivelist');

class USBEventsController {
    constructor() {
        this.usbEvents = new EventEmitter();
        this.usbList = [];
        this.startListening();
    }

    static isReadable(mediaDrive) {
        return new Promise((resolve) => {
            fs.access(mediaDrive, fs.constants.F_OK | fs.constants.R_OK, (error) => {
                resolve(!error);
            });
        });
    }

    static getUSBNameOnWindows(mountPath) {
        let dl = mountPath.slice(0, -1);
        const getUSBName = execSync(`wmic logicaldisk where "deviceid='${dl}'" get volumename`);
        return (getUSBName.toString().split('\n')[1]).trim();
    }

    async startListening() {

        usbDetect.startMonitoring();

        const drives = await drivelist.list();
        for await (const drive of drives) {
            if (drive.isUSB) {
                for await (const i of drive.mountpoints) {
                    if (i) {
                        const mountPath = i.path;
                        const isReadable = await USBEventsController.isReadable(mountPath);
                        this.usbEvents.emit('insert', {
                            event: 'insert',
                            data: {
                                key: mountPath,
                                name: process.platform === 'linux' ? nodePath.basename(mountPath) : USBEventsController.getUSBNameOnWindows(mountPath),
                                devicepath: drive.device,
                                isAccessible: isReadable
                            }
                        });
                        this.usbList.push(mountPath);
                    }
                }
            }
        }

        // Detect insert
        usbDetect.on('add', async () => {
            const poll = setInterval(async () => {
                drivelist.list().then(async (drives) => {
                    drives.forEach(async (drive) => {
                        if (drive.isUSB) {
                            drive.mountpoints.forEach(async (i) => {
                                if (i) {
                                    const mountPath = i.path;
                                    if (!this.usbList.includes(mountPath)) {
                                        const isReadable = await USBEventsController.isReadable(mountPath);
                                        this.usbEvents.emit('insert', {
                                            event: 'insert',
                                            data: {
                                                key: mountPath,
                                                name: process.platform === 'linux' ? nodePath.basename(mountPath) : USBEventsController.getUSBNameOnWindows(mountPath),
                                                devicepath: drive.device,
                                                isAccessible: isReadable
                                            }
                                        });
                                        this.usbList.push(mountPath);
                                        clearInterval(poll)
                                    }
                                }
                            });
                        }
                    })
                })
            }, 500)
        });

        // Detect remove
        usbDetect.on('remove', () => {
            let newUsbList = []
            let removalList = []
            drivelist.list().then((drives) => {
                drives.forEach((drive) => {
                    if (drive.isUSB) {
                        drive.mountpoints.forEach(async (i) => {
                            if (i) {
                                newUsbList.push(i.path);
                            }
                        });
                    }
                })
                removalList = this.usbList.filter(x => !newUsbList.includes(x));
                this.usbList = this.usbList.filter(x => !removalList.includes(x))
                removalList.forEach(i => {
                    this.usbEvents.emit('eject', { event: 'eject', data: { key: i } });
                })
            })
        });

    }

    on(event, cb) {
        if (event === 'insert') {
            this.usbEvents.on('insert', (data) => {
                cb(data);
            });
        }
        if (event === 'eject') {
            this.usbEvents.on('eject', (data) => {
                cb(data);
            });
        }
    }

    async stopListening() {
        usbDetect.stopMonitoring();
    }

}

module.exports = new USBEventsController();
