import net from 'net'
import { Device } from '..'
const delay = ms => new Promise(res => setTimeout(res, ms))

let server, device, openSocket

describe('Normal Device Operation', () => {
    beforeEach(done => {
        server = net.createServer(socket => {
            // Track open socket so we can simulate a server closing their connection
            openSocket = socket
            socket.on('data', data => {
                const msg = data.toString()
                if (msg === 'example-request') {
                    socket.write('example-response')
                }
                else if (msg === 'other-request') {
                    // Write an unexpected response first
                    socket.write('other-data')
                    // Then the expected response
                    setTimeout(() => socket.write('example-response'), 10)
                }
                else if (msg === 'failed-request') {
                    socket.write('failure!')
                }
            })
        })
        device = new Device({ host: '127.0.0.1', port: 3003 })
        server.listen(3003, done)
    })

    afterEach(async done => {
        await device.close()
        if (server.listening) server.close(done)
        else done()
    })

    describe('Device Setup', () => {
        it('should connect to socket', async () => {
            await device.connect()
            expect(device.connected).toBe(true)
        })
        it('should set the host', () => {
            expect(device.host).toBe('127.0.0.1')
        })
        it('should allow host to be retrieved via the (deprecated) ip attribute', () => {
            const deprecation = jest.spyOn(console, 'warn').mockImplementation(() => {})
            expect(device.ip).toBe('127.0.0.1')
            expect(deprecation).toHaveBeenCalledWith(expect.stringMatching(/deprecated/))
            deprecation.mockRestore()
        })
        it('should set the default port', () => {
            expect(device.port).toBe(3003)
        })
        it('should accept the (deprecated) IP parameter instead of host', () => {
            const deprecation = jest.spyOn(console, 'warn').mockImplementation(() => {})
            const testDevice = new Device({ ip: '127.0.0.10', port: 3004 })
            expect(deprecation).toHaveBeenCalledWith(expect.stringMatching(/deprecated/))
            expect(testDevice.host).toBe('127.0.0.10')
            deprecation.mockRestore()
        })
    })

    describe('Device Listeners', () => {
        it('should receive socket data', async () => {
            const receive = jest.fn()
            device.on('data', receive)
            await device.connect()
            device.socket.emit('data', 'zzz')
            expect(receive).toHaveBeenCalled()
        })
        it('should disconnect on socket close', async () => {
            const disconnect = jest.spyOn(device, 'onDisconnect')
            const listener = jest.fn()
            device.on('close', listener)
            await device.connect()
            device.socket.emit('close')
            expect(disconnect).toHaveBeenCalled()
            expect(listener).toHaveBeenCalled()
        })
        it('should report socket errors', async () => {
            const error = jest.fn()
            device.on('error', error)
            await device.connect()
            device.socket.emit('error', 'testing')
            expect(error).toHaveBeenCalled()
        })
    })

    describe('Device Requests', () => {
        it('should make a request and get a response', async () => {
            await device.connect()
            const response = await device.request('example-request', 'example-response')
            expect(response).toEqual(expect.arrayContaining(['example-response']))
        })
        it('should make a request and process an expected failure', async () => {
            await device.connect()
            const response = device.request('failed-request', 'never', 'failure!')
            await expect(response).rejects.toEqual(expect.arrayContaining(['failure!']))
        })
        it('should make a request and ignore non-matching responses', async () => {
            await device.connect()
            const response = await device.request('other-request', 'example-response')
            expect(response).toEqual(expect.arrayContaining(['example-response']))
        })
        it('should timeout if a request was not satisfied on time', async() => {
            await device.connect()
            device.responseTimeout = 5
            const response = device.request('unknown-request', 'never')
            await expect(response).rejects.toThrow('Timeout')
            device.responseTimeout = 3000
        })
    })

    describe('Device Reconnect', () => {
        it('should try to reconnect if initial connection cannot be made', async() => {
            // Watch error handler
            const error = jest.fn()
            device.on('error', error)
            // Watch connection
            const connectEvent = jest.fn()
            device.on('connect', connectEvent)
            // Attempt connection
            const connect = jest.spyOn(device, 'connect')
            device.host = '10.255.255.1'
            // 50ms timout, 5ms reconnect
            device.responseTimeout = 50
            device.reconnectInterval = 0.005
            const promise = device.connect()
            // Wait at least 55ms to ensure we catch a reconnect/timeout
            await delay(65)
            expect(connect.mock.calls.length).toBeGreaterThanOrEqual(2)
            expect(error.mock.calls.length).toBeGreaterThanOrEqual(1)
            expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Timeout connecting to 10.255.255.1:3003' }))
            expect(connectEvent).toHaveBeenCalledTimes(0)
            // Set to a valid host and check the original promise still resolves
            device.host = '127.0.0.1'
            await expect(promise).resolves.toBe(undefined)
        })
        it('should try to reconnect after disconnecting on error', async () => {
            // Track close event
            const close = jest.fn()
            device.on('close', close)
            device.on('error', () => {})
            const connect = jest.spyOn(device, 'connect')
            device.reconnectInterval = 0.005
            await device.connect()
            device.socket.destroy(new Error('A Serious Failure'))
            await delay(50) // Device attempts reconnect after 5ms
            expect(connect).toHaveBeenCalledTimes(2)
            expect(close).toHaveBeenCalledTimes(1)
        })
        it('should try to reconnect if the client closes the connection', async() => {
            const connect = jest.spyOn(device, 'connect')
            device.reconnectInterval = 0.005
            await device.connect()
            // Wait a split second to ensure the server receives the new connection
            await delay(50)
            // Pretend the server closes the connection
            await new Promise(res => {
                openSocket.end(res)
            })
            await delay(100)
            expect(connect.mock.calls.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe('Device Errors', () => {
        it('should emit errors from the socket', async () => {
            const error = jest.fn()
            device.on('error', error)
            await device.connect()
            device.socket.emit('error', 'real error')
            expect(error).toHaveBeenCalledWith('real error')
        })
    })
})