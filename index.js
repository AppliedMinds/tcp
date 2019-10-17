const net = require('net')
const EventEmitter = require('events')

class Device extends EventEmitter {
    constructor({ ip, port, reconnectInterval=3 }) {
        super()
        this.ip = ip
        this.port = port
        this.active = false
        this.reconnectInterval = reconnectInterval
        this.state = {}
    }
    connect() {
        this.socket = new net.Socket()
        this.socket.on('data', this.onReceive.bind(this))
        this.socket.on('close', this.onDisconnect.bind(this))
        this.socket.on('error', this.onError.bind(this))
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
            console.info(`Connection to ${this.type} at ${this.ip}:${this.port} closed!`)
        }
    }
    onConnect() {
        console.info(`Connected to ${this.type} at ${this.ip}:${this.port}`)
        this.connected = true
    }
    onDisconnect(onError) {
        if (onError) {
            this.socket.destroy()
            let message = `Connection to ${this.type} at ${this.ip}:${this.port} lost!`
            message = `${message} Attempting reconnect in ${this.reconnectInterval} seconds...`
            setTimeout(this.connect.bind(this), this.reconnectInterval * 1000)
            console.warn(message)
        }
    }
    onError(err) {
        console.error(`Error on connection to ${this.type} at ${this.ip}:${this.port}: ${err.code}`)
    }
    onReceive() {
        // Overwrite this function in child class
    }
    // Make a request and wait for a response
    request(command, expectedResponse, errResponse) {
        let receipt = new Promise((res, rej) => {
            let receiver = (msg) => {
                msg = msg.toString()
                let success = msg.match(expectedResponse)
                let failure = errResponse ? msg.match(errResponse) : false
                if (!success && !failure) return
                this.socket.off('data', receiver)
                if (failure) rej(failure)
                else res(success)
            }
            this.socket.on('data', receiver)
        })
        this.send(command)
        return receipt
    }
    async send(command) {
        return new Promise((res) => this.socket.write(command, res))
    }
    get type() {
        return `Unknown ${this.constructor.name}`
    }
}

module.exports = { Device }