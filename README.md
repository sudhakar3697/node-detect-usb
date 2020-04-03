# detect-usb
Detect USB and get mount points/paths

Usage

```
const usbEvents = require('detect-usb');

usbEvents.on('insert', (data) => {
    console.log(data);
})

usbEvents.on('eject', (data) => {
    console.log(data);
})

// To stop listening
usbEvents.stopListening();
```

Sample Data

```
{ 
event: 'insert',
data:
    { 
        key: '/media/test/sss',
        name: 'sss',
        devicepath: '/dev/sda',
        isAccessible: true 
    } 
}

{ event: 'eject', data: { key: '/media/test/sss' } }
```

Note

* Verified on Windows & Linux
* Uses [usb-detection](https://www.npmjs.com/package/usb-detection) & [drivelist](https://www.npmjs.com/package/drivelist)