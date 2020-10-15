const net = require('net')
const EventEmitter = require('events')

const DEFAULT_RECONNECT_INTERVAL = 3 // seconds
const SECOND = 1000 // ms

class Device extends EventEmitter {
    constructor({ ip, port, reconnectInterval = DEFAULT_RECONNECT_INTERVAL, responseTimeout = DEFAULT_RECONNECT_INTERVAL }) {
        super()
        this.ip = ip
        this.port = port
        this.reconnectInterval = reconnectInterval
        this.responseTimeout = responseTimeout * SECOND
    }
    connect() {
        this.socket = new net.Socket()
        this.socket.on('data', this.emit.bind(this, 'data'))
        this.socket.on('close', this.onDisconnect.bind(this))
        this.socket.on('error', this.emit.bind(this, 'error'))
        this.socket.setKeepAlive(true)
        // Send immediately when write() is called, no buffering
        this.socket.setNoDelay()
        return new Promise(resolve => {
            this.socket.on('connect', resolve)
            this.socket.connect(this.port, this.ip, this.onConnect.bind(this))
        })
    }
    async close() {
        if (this.socket) {
            await new Promise(res => this.socket.end(res))
        }
    }
    onConnect() {
        this.connected = true
        this.emit('connect')
    }
    onDisconnect(onError) {
        if (onError) {
            this.socket.destroy()
            this.emit('reconnect', `Connection at at ${this.ip}:${this.port} lost! Attempting reconnect in ${this.reconnectInterval} seconds...`)
            setTimeout(this.connect.bind(this), this.reconnectInterval * SECOND)
        }
        this.emit('close')
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