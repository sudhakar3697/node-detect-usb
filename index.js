const fs = require('fs');
const nodePath = require('path');
const { EventEmitter } = require('events');
const { execSync } = require('child_process');
const usbDetect = require('usb-detection');
const drivelist = require('drivelist');

class Utils {
    static isReadable(mediaDrive) {
        return new Promise((resolve) => {
            fs.access(mediaDrive, fs.constants.F_OK | fs.constants.R_OK, (error) => {
                resolve(!error);
            });
        });
    }

    static getUSBLabel(mountPath) {
        if (process.platform === 'win32') {
            let dl = mountPath.slice(0, -1);
            const getUSBName = execSync(`wmic logicaldisk where "deviceid='${dl}'" get volumename`);
            return (getUSBName.toString().split('\n')[1]).trim();
        }
        else {
            return nodePath.basename(mountPath)
        }
    }
}

class USBEventsController extends EventEmitter {

    constructor() {
        super();
        this.usbList = new Map();
        this.initial = true;
    }

    async getUSBList() {
        if (this.initial) {
            return new Promise((resolve, reject) => {
                this.once('ready', data => {
                    setImmediate(() => {
                        resolve(data);
                    });
                }
                );
                this.once('error', err => reject(err));
                this.initial = false;
            });
        }
        return Array.from(this.usbList.values());
    }

    async startListening() {
        try {

            usbDetect.startMonitoring();

            const drives = await drivelist.list();
            for await (const drive of drives) {
                if (drive.isUSB) {
                    for await (const i of drive.mountpoints) {
                        if (i) {
                            this.usbList.set(i.path, {
                                key: i.path,
                                name: Utils.getUSBLabel(i.path),
                                devicepath: drive.device,
                                isAccessible: await Utils.isReadable(i.path)
                            });
                        }
                    }
                }
            }

            this.emit('ready', Array.from(this.usbList.values()));


            // Detect insert
            usbDetect.on('add', async () => {
                const poll = setInterval(async () => {
                    const drives = await drivelist.list();
                    for await (const drive of drives) {
                        if (drive.isUSB) {
                            for await (const i of drive.mountpoints) {
                                if (i) {
                                    if (!this.usbList.has(i.path)) {
                                        const mountData = {
                                            key: i.path,
                                            name: Utils.getUSBLabel(i.path),
                                            devicepath: drive.device,
                                            isAccessible: await Utils.isReadable(i.path)
                                        }
                                        this.emit('insert', {
                                            event: 'insert',
                                            data: mountData
                                        });
                                        this.usbList.set(i.path, mountData);
                                        clearInterval(poll);
                                    }
                                }
                            }
                        }
                    }
                }, 500);
            });

            // Detect remove
            usbDetect.on('remove', async () => {
                const newUsbList = [];
                let removalList = [];
                const drives = await drivelist.list();
                for await (const drive of drives) {
                    if (drive.isUSB) {
                        for await (const i of drive.mountpoints) {
                            if (i) {
                                newUsbList.push(i.path);
                            }
                        }
                    }
                }
                removalList = Array.from(this.usbList.keys()).filter(x => !newUsbList.includes(x));
                removalList.forEach(i => {
                    this.usbList.delete(i);
                    this.emit('eject', { event: 'eject', data: { key: i } });
                })
            });

        } catch (err) {
            this.emit('error', { event: 'error', data: [] });
        }
    }

    stopListening() {
        usbDetect.stopMonitoring();
    }

}

module.exports = new USBEventsController();
