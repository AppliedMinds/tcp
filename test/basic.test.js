import assert from 'node:assert/strict'
import net from 'node:net'
import { beforeEach, afterEach, describe, it, mock } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Device } from '../index.js'

let server, device, openSocket, port

describe('Normal Device Operation', () => {
    beforeEach(async() => {
        server = net.createServer(socket => {
            // Track open socket so we can simulate a server closing their connection
            openSocket = socket
            socket.on('data', async data => {
                const msg = data.toString()
                if (msg === 'example-request') {
                    socket.write('example-response')
                } else if (msg === 'other-request') {
                    // Write an unexpected response first
                    socket.write('other-data')
                    // Then the expected response
                    await delay(10)
                    socket.write('example-response')
                } else if (msg === 'failed-request') {
                    socket.write('failure!')
                }
            })
        })
        await new Promise(res => {
            server.listen(res)
        })
        port = server.address().port
        device = new Device({ host: '127.0.0.1', port })
    })

    afterEach(async() => {
        await device.close()
        await new Promise(res => {
            if (server.listening) server.close(res)
            else res()
        })
    })

    describe('Device Setup', () => {
        it('should connect to socket', async() => {
            await device.connect()
            assert.equal(device.connected, true)
        })
        it('should not connect again if still connected', async() => {
            const connectEvent = mock.fn()
            device.on('connect', connectEvent)
            await device.connect()
            await device.connect()
            assert.equal(connectEvent.mock.calls.length, 1)
        })
        it('should set the host', () => {
            assert.equal(device.host, '127.0.0.1')
        })
        it('should allow host to be retrieved via the (deprecated) ip attribute', () => {
            const deprecation = mock.method(console, 'warn', () => {})
            assert.equal(device.ip, '127.0.0.1')
            assert.match(deprecation.mock.calls[0].arguments[0], /deprecated/)
            deprecation.mock.restore()
        })
        it('should set the default port', () => {
            assert.equal(device.port, port)
        })
        it('should accept the (deprecated) IP parameter instead of host', () => {
            const deprecation = mock.method(console, 'warn', () => {})
            const testDevice = new Device({ ip: '127.0.0.10', port: 3004 })
            assert.match(deprecation.mock.calls[0].arguments[0], /deprecated/)
            assert.equal(testDevice.host, '127.0.0.10')
            deprecation.mock.restore()
        })
        it('should prioritize host over ip', () => {
            const deprecation = mock.method(console, 'warn', () => {})
            const testDevice = new Device({ ip: '127.0.0.10', host: 'example.com', port: 3004 })
            assert.match(deprecation.mock.calls[0].arguments[0], /deprecated/)
            assert.equal(testDevice.host, 'example.com')
        })
    })

    describe('Device Listeners', () => {
        it('should receive socket data', async() => {
            const receive = mock.fn()
            device.on('data', receive)
            await device.connect()
            device.socket.emit('data', 'zzz')
            assert(receive.mock.calls.length > 0)
        })
        it('should disconnect on socket close', async() => {
            const disconnect = mock.method(device, 'onDisconnect')
            const listener = mock.fn()
            device.on('close', listener)
            await device.connect()
            // Skip reconnects, we're not testing that
            device.reconnectInterval = 0
            device.socket.emit('close')
            assert(disconnect.mock.calls.length > 0)
            assert(listener.mock.calls.length > 0)
        })
        it('should report socket errors', async() => {
            const error = mock.fn()
            device.on('error', error)
            await device.connect()
            device.socket.emit('error', 'testing')
            assert(error.mock.calls.length > 0)
        })
    })

    describe('Device Requests', () => {
        it('should make a request and get a response', async() => {
            await device.connect()
            const response = await device.request('example-request', 'example-response')
            assert(response.includes('example-response'))
        })
        it('should make a request and process an expected failure', async() => {
            await device.connect()
            const response = device.request('failed-request', 'never', 'failure!')
            await assert.rejects(response, /failure!/)
        })
        it('should make a request and ignore non-matching responses', async() => {
            await device.connect()
            const response = await device.request('other-request', 'example-response')
            assert(response.includes('example-response'))
        })
        it('should timeout if a request was not satisfied on time', async() => {
            await device.connect()
            device.responseTimeout = 5
            const response = device.request('unknown-request', 'never')
            await assert.rejects(response, /Timeout/i)
            device.responseTimeout = 3000
        })
    })

    describe('Device Reconnect', () => {
        it('should try to reconnect if initial connection cannot be made', async() => {
            // Watch error handler
            const error = mock.fn()
            device.on('error', error)
            // Watch connection
            const connectEvent = mock.fn()
            device.on('connect', connectEvent)
            // Attempt connection
            const connect = mock.method(device, 'connect')
            device.host = 'example.com'
            device.port = 81
            // 50ms timeout, 5ms reconnect
            device.responseTimeout = 100
            device.reconnectInterval = 0.05
            const promise = device.connect()
            // Wait at least 150ms to ensure we catch a timeout + reconnect
            await delay(200)
            assert(connect.mock.calls.length >= 2)
            assert(error.mock.calls.length >= 1)
            assert(error.mock.calls.some(call => call.arguments[0].message.includes('Timeout connecting to example.com:81')))
            assert.equal(connectEvent.mock.calls.length, 0)
            // Set to a valid host and check the original promise still resolves
            device.host = '127.0.0.1'
            device.port = port
            assert.equal(await promise, undefined)
        })
        it('should try to reconnect after disconnecting on error', async() => {
            // Track close event
            const close = mock.fn()
            device.on('close', close)
            device.on('error', () => {})
            const connect = mock.method(device, 'connect')
            device.responseTimeout = 50
            device.reconnectInterval = 0.005
            await device.connect()
            device.socket.destroy(new Error('A Serious Failure'))
            await delay(50) // Device attempts reconnect after 5ms
            assert.equal(connect.mock.calls.length, 2)
            assert.equal(close.mock.calls.length, 1)
        })
        it('should try to reconnect if the client closes the connection', async() => {
            const connect = mock.method(device, 'connect')
            device.reconnectInterval = 0.005
            await device.connect()
            // Wait a split second to ensure the server receives the new connection
            await delay(50)
            // Pretend the server closes the connection
            await new Promise(res => {
                openSocket.end(res)
            })
            await delay(100)
            assert(connect.mock.calls.length >= 2)
        })
        it('should try to reconnect if a connection timeout occurs', async() => {
            // Watch error handler
            const error = mock.fn()
            device.on('error', error)
            // Watch connection
            const connectEvent = mock.fn()
            device.on('connect', connectEvent)
            // Watch timeout handler
            const timeout = mock.fn()
            device.on('timeout', timeout)
            // Attempt connection
            const connect = mock.method(device, 'connect')
            device.reconnectInterval = 0.005
            await device.connect()
            // Trigger a timeout
            device.socket.emit('timeout')
            // Wait at least 150ms to ensure we catch a timeout + reconnect
            await delay(200)
            assert(connect.mock.calls.length >= 2)
            assert(error.mock.calls.length >= 1)
            assert(error.mock.calls.some(call => call.arguments[0].message === `Timeout connecting to 127.0.0.1:${port}`))
            assert(timeout.mock.calls.length > 0)
        })
    })

    describe('Device Errors', () => {
        it('should emit errors from the socket', async() => {
            const error = mock.fn()
            device.on('error', error)
            // Skip reconnects, we're not testing that
            device.reconnectInterval = 0
            await device.connect()
            device.socket.emit('error', 'real error')
            assert.equal(error.mock.calls[0].arguments[0], 'real error')
        })
    })
})