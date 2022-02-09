TCP
===

![tests](https://github.com/appliedminds/tcp/workflows/CI/badge.svg?branch=master)

Easily integrate with TCP-based services and devices using Node.js.

Features:

 * Easy event management
 * Automatic connection healing
 * Asynchronous send methods
 * RegEx-based request/response handling

##### Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Examples](#usage-examples)
- [API Docs](#api-docs)
- [License](#license)

Requirements
------------

 * Node 12+

Installation
------------

```shell
npm install @appliedminds/tcp
```

Usage / Examples
----------------

Create a new `Device` for any TCP-based service.

For example, imagine a device that uses a single byte `0x01`, `0x02` or `0x03` to send forward, back or stop commands, respectively:

```javascript
import { Device as TCPDevice } from '@appliedminds/tcp'

class Motor {
    constructor(host) {
        this.device = new TCPDevice({ host, port: 28836 })
        this.device.on('data', this.onReceive.bind(this))
        this.device.connect()
        this.state = 'stopped'
    }
    backward() {
        this.device.send(Buffer.from([0x02]))
    }
    forward() {
        this.device.send(Buffer.from([0x01]))
    }
    onReceive(data) {
        // Cache state when the device relays its state
        this.state = data
    }
    stop() {
        this.device.send(Buffer.from([0x03]))
    }
}
```

API Docs
--------

### `new Device({ host : String, port : Number, parser : Transform, reconnectInterval? : Number, responseTimeout? : Number })`

Create a new TCP client.

  * `host`: Hostname or IP address of device/service
  * `port`: TCP port of device/service
  * `parser`: A data parser that extends [Stream.Transform](https://nodejs.org/api/stream.html#stream_class_stream_transform) (default: no parsing)
  * `reconnectInterval`: Seconds until reconnect attempt after disconnect or error, use `0` for no reconnects (default: `3`)
  * `responseTimeout`: Seconds until a call to `request()` will automatically time out (default: `3`)

### Event: `'close'`

Emitted when the device has been closed (either expected or unexpected)

### Event: `'connect'`

Emitted when a successful connection has been made.

### Event: `'data'`

Emitted with a `Buffer` when data is received from the device.

### Event: `'error'`

Emitted when an error is encountered.

### Event: `'timeout'`

Emitted when a connection or message times out (also emits `error`, but allows for separate behavior)

### Event: `'reconnect'`

Emitted when a reconnection is attempted.

### `device.close()` : `<Promise>`

Manually close connection. Resolves once the connection has been closed.
  
### `device.connect()` : `<Promise>`

Open connection to TCP service/device. Resolves when connection has been made.

### `device.request(command : Buffer/String, expectedResponse : String/Regex, errorResponse? : String/Regex)` : `<Promise>`

Make a request and wait for a response.

 * `command`: String or buffer to send
 * `expectedResponse`: Regex or string indicating a successful response
 * `errorResponse`: Regex or string indicating an error response

The returned Promise will resolve to a list of regex tokens matching subpatterns in `expectedResponse` or `errorResponse` (or a list of length 1 if a string was supplied)

### `device.send(data : Buffer/String)` : `<Promise>`

Send data to service/device.

  * `data`: Outgoing buffer or string

Resolves when data has been sent.

Contributing & Tests
-------------------

1. Install development dependencies: `npm install`
2. Run tests: `npm test`

License
-------

MIT
