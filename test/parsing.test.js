import net from 'net'
import { Transform } from 'stream'
import { setTimeout } from 'timers/promises'
import { Device } from '..'

class ByteLengthParser extends Transform {
    constructor({ length = 4, ...options } = {}) {
        super(options)
        this.limitTo = length
        this.buffer = Buffer.alloc(0)
    }
    _transform(chunk, encoding, cb) {
        let data = Buffer.concat([this.buffer, chunk])
        while(data.length >= this.limitTo) {
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
        const receive = jest.fn()
        device.on('data', receive)
        await device.connect()

        // Wait for the server to accept the connection
        await setTimeout(10)

        const testData = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        openSocket.write(testData)

        // Wait for the client to receive the data
        await setTimeout(10)

        expect(receive).toHaveBeenCalledWith(testData.slice(0, 4))
        expect(receive).toHaveBeenCalledWith(testData.slice(4))

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
        await setTimeout(50)
        openSocket.end()
        await setTimeout(50)
        openSocket.end()
        await setTimeout(50) // Device attempts reconnect after 5ms

        expect(device.dataPipe.listenerCount('data')).toBe(1)
        expect(device.dataPipe.listenerCount('unpipe')).toBe(1)
        // Make sure the data pipe is still open
        expect(device.dataPipe._writableState.ended).toBe(false)

        await device.close()
        await new Promise(res => server.close(res))
    })
})