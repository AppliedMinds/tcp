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
        this.send(Buffer.from([0x02]))
    }
    forward() {
        this.send(Buffer.from([0x01]))
    }
    onReceive(data) {
        // Set our state when the device relays its state
        this.state = data
    }
    stop() {
        this.send(Buffer.from([0x03]))
    }
}
```

API Documentation
-----------------

### `new Device({ ip : String, port : Number, reconnectInterval? : Number, autoConnect? : Boolean })`

Constructor

  * `ip`: IP address of device/service
  * `port`: Numeric TCP port of device/service
  * `reconnectInterval`: Seconds until reconnect attempt after disconnect or error (default: `3`)
  
### `Device.connect()` : `<Promise>`

Open connection to TCP service/device. Resolves when connection has been made.

### `Device.onReceive(data : Buffer)` : void

Override in child classes. Automatically called when data is available from the service/device.

  * `data`: Incoming string

### `Device.request(command : Buffer/String, expectedResponse : String/Regex, errorResponse? : String/Regex)` : `<Promise>`

Make a request and wait for a response.

 * `command`: String or buffer to send
 * `expectedResponse`: Regex or String to use to indicate a successful response
 * `errorResponse`: Regex or string to use to indicate an error response

The returned Promise will resolve to a list of regex tokens (a list of length 1 if just a string supplied)

### `Device.send(data : Buffer/String)` : `<Promise>`

Send data to service/device.

  * `data`: Outgoing buffer or string

Resolves when data has been sent.

Development & Tests
-------------------

1. Clone repo: `git clone <repo_url>`
2. Install dependencies: `npm install`
3. Run test suite: `npm test`
