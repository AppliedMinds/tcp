import assert from 'node:assert/strict'
import net from 'node:net'
import { Transform } from 'node:stream'
import { describe, it, mock } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Device } from '../index.js'

class ByteLengthParser extends Transform {
    constructor({ length = 4, ...options } = {}) {
        super(options)
        this.limitTo = length
        this.buffer = Buffer.alloc(0)
    }
    _transform(chunk, encoding, cb) {
        let data = Buffer.concat([this.buffer, chunk])
        while (data.length >= this.limitTo) {
            this.push(data.slice(0, this.limitTo))
            data = data.slice(this.limitTo)
        }
        this.buffer = data
        cb()
    }
    _flush(cb) {
        this.push(this.buffer)
        this.buffer = Buffer.alloc(0)
        cb()
    }
}

describe('Data Parsing', () => {
    it('should accept alternate data parsers', async() => {
        // Set up test server
        let openSocket
        const server = net.createServer(socket => {
            openSocket = socket
        })
        await new Promise(res => server.listen(3004, res))

        const device = new Device({ host: '127.0.0.1', port: 3004, parser: new ByteLengthParser() })
        const receive = mock.fn()
        device.on('data', receive)
        await device.connect()

        // Wait for the server to accept the connection
        await delay(10)

        const testData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        openSocket.write(testData)

        // Wait for the client to receive the data
        await delay(10)

        assert.deepEqual(receive.mock.calls[0].arguments[0], testData.slice(0, 4))
        assert.deepEqual(receive.mock.calls[1].arguments[0], testData.slice(4))

        await device.close()
        await new Promise(res => server.close(res))
    })
    it('should not duplicate data events on reconnect', async() => {
        // Set up test server
        let openSocket
        const server = net.createServer(socket => {
            openSocket = socket
        })
        await new Promise(res => server.listen(3004, res))

        const device = new Device({ host: '127.0.0.1', port: 3004, parser: new ByteLengthParser() })
        device.on('error', () => {})
        device.reconnectInterval = 0.005
        await device.connect()
        await delay(50)
        openSocket.end()
        await delay(50)
        openSocket.end()
        await delay(50) // Device attempts reconnect after 5ms

        assert.equal(device.dataPipe.listenerCount('data'), 1)
        assert.equal(device.dataPipe.listenerCount('unpipe'), 1)
        // Make sure the data pipe is still open
        assert.equal(device.dataPipe._writableState.ended, false)

        await device.close()
        await new Promise(res => server.close(res))
    })
})