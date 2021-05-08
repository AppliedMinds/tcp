const net = require('net')
const EventEmitter = require('events')

const DEFAULT_RECONNECT_INTERVAL = 3 // seconds
const SECOND = 1000 // ms

class Device extends EventEmitter {
    constructor({ host, ip, port, reconnectInterval = DEFAULT_RECONNECT_INTERVAL, responseTimeout = DEFAULT_RECONNECT_INTERVAL }) {
        super()
        if (ip) {
            console.warn('Device.ip has been deprecated. Please use Device.host instead.')
            if (!host) host = ip
        }
        this.host = host
        this.port = port
        this.reconnectInterval = reconnectInterval
        this.responseTimeout = responseTimeout * SECOND
        this.connected = false
        this.userClose = false
    }
    connect(reconnect = false) {
        this.userClose = false
        this.socket = new net.Socket()
        this.socket.on('data', this.emit.bind(this, 'data'))
        this.socket.on('close', this.onDisconnect.bind(this))
        this.socket.on('error', this.emit.bind(this, 'error'))
        this.socket.setKeepAlive(true)
        // Send immediately when write() is called, no buffering
        this.socket.setNoDelay()
        return new Promise(resolve => {
            const connectTimeout = setTimeout(this.onTimeout.bind(this), this.responseTimeout)
            this.socket.on('connect', () => {
                clearTimeout(connectTimeout)
            })
            // Update our resolver if this is an initial connection
            // so the client can await the `connect()` call correctly
            // in case of reconnects
            if (!reconnect) this.connectResolver = resolve
            this.socket.connect(this.port, this.host, this.onConnect.bind(this))
        })
    }
    async close() {
        // Signal the user intentionally closed the socket
        this.userClose = true
        if (this.socket && !this.socket.destroyed) {
            await new Promise(res => this.socket.end(res))
        }
        this.connected = false
    }
    get ip() {
        console.warn('Device.ip has been deprecated. Please use Device.host instead.')
        return this.host
    }
    onConnect() {
        if (this.connectResolver) this.connectResolver()
        this.connected = true
        this.emit('connect')
    }
    onDisconnect(onError) {
        // Automatically reconnect if there was an error or the server closed the connection for some reason
        // (I.E. the user did not close the connection manually)
        if (onError || !this.userClose) {
            this.emit('reconnect', `Connection at at ${this.host}:${this.port} lost! Attempting reconnect in ${this.reconnectInterval} seconds...`)
            setTimeout(this.connect.bind(this, true), this.reconnectInterval * SECOND)
        }
        this.emit('close')
    }
    onTimeout() {
        this.emit('timeout')
        this.socket.destroy(new Error(`Timeout connecting to ${this.host}:${this.port}`))
    }
    // Make a request and wait for a response
    request(command, expectedResponse, errResponse) {
        const receipt = new Promise((res, rej) => {
            const receiver = msg => {
                msg = msg.toString()
                const success = msg.match(expectedResponse)
                const failure = errResponse ? msg.match(errResponse) : false
                if (!success && !failure) return
                clearTimeout(timeout)
                this.socket.off('data', receiver)
                if (failure) rej(failure)
                else res(success)
            }
            const timeout = setTimeout(() => {
                this.socket.off('data', receiver)
                rej(new Error('Timeout while waiting for response!'))
            }, this.responseTimeout)
            this.socket.on('data', receiver)
        })
        this.send(command)
        return receipt
    }
    send(command) {
        return new Promise(res => this.socket.write(command, res))
    }
}

module.exports = { Device }