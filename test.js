import net from 'net'
import { Device } from './index.js'
const delay = (ms) => new Promise((res) => setTimeout(res, ms))

var server, device

beforeEach(done => {
    server = net.createServer(socket => { 
        socket.on('data', data => {
            let msg = data.toString()
            if (msg == 'example-request') {
                socket.write('example-response')
            }
            else if (msg == 'other-request') {
                // Write an unexpected response first
                socket.write('other-data')
                // Then the expected response
                setTimeout(() => socket.write('example-response'), 10)
            }
            else if (msg == 'failed-request') {
                socket.write('failure!')
            }
        })
    })
    device = new Device({ip: '127.0.0.1', port: 3003})
    server.listen(3003, done)
})

afterEach(async(done) => {
    await device.close()
    server.close(done)
})

describe('Device Setup', () => {
    it('should connect to socket', async () => {
        await device.connect()
        expect(device.connected).toBe(true)
    })
    it('should set the ip', () => {
        expect(device.ip).toBe('127.0.0.1')
    })
    it('should set the default port', () => {
        expect(device.port).toBe(3003)
    })
})

describe('Device Listeners', () => {
    it('should receive socket data', async () => {
        let receive = jest.fn()
        device.on('data', receive)
        await device.connect()
        device.socket.emit('data', 'zzz')
        expect(receive).toHaveBeenCalled()
    })
    it('should disconnect on socket close', async () => {
        let disconnect = jest.spyOn(device, 'onDisconnect')
        let listener = jest.fn()
        device.on('close', listener)
        await device.connect()
        device.socket.emit('close')
        expect(disconnect).toHaveBeenCalled()
        expect(listener).toHaveBeenCalled()
    })
    it('should report socket errors', async () => {
        let error = jest.fn()
        device.on('error', error)
        await device.connect()
        device.socket.emit('error', 'testing')
        expect(error).toHaveBeenCalled()
    })
})

describe('Device Requests', () => {
    it('should make a request and get a response', async () => {
        await device.connect()
        let response = await device.request('example-request', 'example-response')
        expect(response).toEqual(expect.arrayContaining(['example-response']))
    })
    it('should make a request and process an expected failure', async () => {
        await device.connect()
        let response = device.request('failed-request', 'never', 'failure!')
        await expect(response).rejects.toEqual(expect.arrayContaining(['failure!']))
    })
    it('should make a request and ignore non-matching responses', async () => {
        await device.connect()
        let response = await device.request('other-request', 'example-response')
        expect(response).toEqual(expect.arrayContaining(['example-response']))
    })
    it('should timeout if a request was not satisfied on time', async() => {
        await device.connect()
        device.responseTimeout = 5
        let response = device.request('unknown-request', 'never')
        await expect(response).rejects.toThrow('Timeout')
        device.responseTimeout = 3000
    })
})

describe('Device Reconnect', () => {
    it('should try to reconnect after disconnecting on error', async () => {
        let connect = jest.spyOn(device, 'connect')
        device.reconnectInterval = .005
        await device.connect()
        device.socket.emit('close', new Error())
        await delay(10) // Device attempts reconnect after 5ms
        expect(connect).toHaveBeenCalledTimes(2)
    })
})

describe('Device Errors', () => {
    it('should emit errors from the socket', async () => {
        let error = jest.fn()
        device.on('error', error)
        await device.connect()
        device.socket.emit('error', 'real error')
        expect(error).toHaveBeenCalledWith('real error')
    })
})
