AMI TCP Wrapper
===============

Base class for creating TCP-based service integrations with Node.js.

Features:

 * Easy event management
 * Automatic connection healing
 * Async send methods
 * RegEx-based request/response handling

Requirements
------------

### Node.js 10+

 * MacOS: `brew install node` using [Homebrew](http://brew.sh/)
 * Linux: `apt install nodejs` ([see Ubuntu/Debian specific instructions](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions)) or `pacman -S nodejs` (Arch Linux)
 * Windows: [Install](https://nodejs.org/en/download/)

Installation
------------

Ensure the local AMI registry is being used:

```shell
npm set -g @ami:registry http://npm:4873
```

Then simply install:

```shell
npm install @ami/tcp
```

Usage / Examples
----------------

`Device` should be used as a base class for any TCP-based service.

For example, imagine a device that uses a single byte 0x01, 0x02 or 0x03 to send forward, back or stop commands, respectively:

```javascript
const TCPDevice = require('@ami/tcp').Device

class Motor extends TCPDevice {
    constructor(ip) {
        super({ ip, port: 28836 })
        this.state = 'stopped'
    }
    backward() {
        this.send('B')
    }
    forward() {
        this.send('F')
    }
    onReceive(data) {
        // Set our state when the device relays its state
        this.state = data
    }
    stop() {
        this.send('S')
    }
}
```

API Documentation
-----------------

### `new Device({ ip, port, reconnectInterval?, autoConnect? })`

Constructor

  * `ip`: IP address of device/service
  * `port`: Numeric TCP port of device/service
  * `reconnectInterval`: Seconds until reconnect attempt after disconnect or error (default: `3`)
  
### `Device.connect()` : `<Promise>`

Open connection to TCP service/device

### `Device.onReceive(data)`

Override in child classes. Automatically called when data is available from the service/device.

  * `data`: Incoming string

### `Device.send(data)` : `<Promise>`

Send data to service/device.

  * `data`: Outgoing string

Development & Tests
-------------------

1. Clone repo: `git clone <repo_url>`
2. Install dependencies: `npm install`
3. Run test suite: `npm test`
