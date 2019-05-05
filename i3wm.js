const os = require('os')
const childProc = require('child_process')
const net = require('net')
const EventEmitter = require('events')


/*******************************
 * PROTOCOL
 *******************************/

/**
 * Message/reply format
 *     "i3-ipc" <message length> <message type> <payload>
 *
 * Length and types are u32.
 */

const MAGIC = 'i3-ipc'

// Byes
const B_M = MAGIC.length
const B_N = 4 // long

// Offsets
const O_M = 0
const O_L = B_M // length
const O_T = B_M + B_N  // message type
const O_P = B_M + B_N + B_N // message payload

// See: https://i3wm.org/docs/ipc.html#_sending_messages_to_i3
const MESSAGES = {
  RUN_COMMAND: 0,
  GET_WORKSPACES: 1,
  SUBSCRIBE: 2,
  GET_OUTPUTS: 3,
  GET_TREE: 4,
  GET_MARKS: 5,
  GET_BAR_CONFIG: 6,
  GET_VERSION: 7,
  GET_BINDING_MODES: 8,
  GET_CONFIG: 9,
  SEND_TICK: 10,
  SYNC: 11,
}

// See: https://i3wm.org/docs/ipc.html#_available_events
const EVENTS_MAP = {
  0: 'workspace',
  1: 'output',
  2: 'mode',
  3: 'window',
  4: 'barconfig_update',
  5: 'binding',
  6: 'shutdown',
  7: 'tick',
}

// See: https://i3wm.org/docs/ipc.html#_reply_format
const REPLIES = {
  COMMAND: 0,
  WORKSPACES: 1,
  SUBSCRIBE: 2,
  OUTPUTS: 3,
  TREE: 4,
  MARKS: 5,
  BAR_CONFIG: 6,
  VERSION: 7,
  BINDING_MODES: 8,
  GET_CONFIG: 9,
  TICK: 10,
  SYNC: 11,
}

/**
 * Used in message object, holding metadata.
 */
const Meta = Symbol('i3wm Meta')

const getSocketPath = async (bin = 'i3') => {
  return new Promise((resolve, reject) => {
    const cmd = [bin, '--get-socketpath']

    childProc.exec(cmd.join(' '), (err, stdout) => {
      if (err) {
        return reject(err)
      }

      resolve(stdout.toString().trim())
    })
  })
}

const encodePayload = (data) => {
  return typeof data === 'object'
    ? JSON.stringify(data)
    : String(data)
}

const encodeMessage = (type, payload) => {
  const payloadData = encodePayload(payload)
  const length = Buffer.byteLength(payloadData, 'ascii')

  const b = Buffer.alloc(
    B_M +
    B_N + // length
    B_N + // type
    length
  )

  b.write(MAGIC, O_M, 'ascii')
  b.writeUInt32LE(length, O_L)
  b.writeUInt32LE(type, O_T)
  b.write(payloadData, O_P, 'ascii')

  return b
}

const encodeCommand = (cmd, ...args) => {
  const _args = args.map(encodePayload)

  const payload = _args.length > 0
        ? [cmd, ..._args].join(' ')
        : cmd

  return encodeMessage(MESSAGES.RUN_COMMAND, payload)
}

/**
 * Reads u32 used in protocol.
 *
 * Integers are not converted by i3 so endiance must be checked.
 */
const readInt = (() => {
  const BUFFER_READ_INT_FN = 'readUInt32' + os.endianness()

  return (buffer, offset = 0) => {
    return buffer[BUFFER_READ_INT_FN](offset)
  }
})()

const decodeMessage = (data) => {
  const length = readInt(data, O_L)
  const rawType = readInt(data, O_T)
  const isEvent = rawType >>> 31 === 1 // highest-bit = 1 -> event
  const type = isEvent
        ? rawType ^ (1 << 31) // toggle highest-bit
        : rawType
  const payload = data.slice(O_P, O_P + length).toString()
  const decoded = JSON.parse(payload)

  decoded[Meta] = {
    isEvent,
    type,
  }

  return decoded
}

/*******************************
 * CLIENT
 *******************************/
class ReplyTimeoutError extends Error { }

const REPLY_TIMEOUT = 200

class Client extends EventEmitter {
  static async connect({
    bin = 'i3'
  } = {}) {
    const sock = await getSocketPath(bin)
    const conn = net.createConnection(sock)
    const client = new Client

    conn.on('data', (data) => {
      const msg = decodeMessage(data)

      client.emit('_message', msg)
    })

    client.on('_write', (data) => {
      conn.write(data)
    })

    return client
  }

  constructor() {
    super()

    this.on('_message', (msg) => {
      const { type, isEvent } = msg[Meta]

      if (isEvent) {
        this._handleEvent(msg, type)
      } else {
        this._handleReply(msg, type)
      }
    })
  }

  message(type, payload) {
    if (typeof type === 'string') {
      const foundType = MESSAGES[type.toUpperCase()]

      if (foundType === undefined) {
        throw new Error(`Message type '${type}' is incorrect`)
      }

      type = foundType;
    }

    const data = encodeMessage(type, payload)

    this._write(data)

    return this._promiseImmidiateReplay()
  }

  /**
   * Sends single command.
   */
  async command(command, ...payload) {
    const data = encodeCommand(command, ...payload)

    this._write(data)

    const [r1] = await this._promiseImmidiateReplay()

    return pipeSuccessReply(r1)
  }

  subscribe(...events) {
    return this.message(MESSAGES.SUBSCRIBE, events)
      .then(pipeSuccessReply)
  }

  sync() {
    return this.message(MESSAGES.SYNC)
      .then(pipeSuccessReply)
  }

  tick(payload) {
    return this.message(MESSAGES.SEND_TICK, payload)
      .then(pipeSuccessReply)
  }

  _handleReply(message) {
    this.emit('_reply', message)
  }

  _handleEvent(message, type) {
    const eventName = EVENTS_MAP[type]

    this.emit(eventName, message)
  }

  _write(data) {
    this.emit('_write', data)
  }

  _promiseImmidiateReplay() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ReplyTimeoutError('Reply timeout'))
      }, REPLY_TIMEOUT)

      // Crypting name to make it easy to identify handlers
      // added by this block.
      const _i3wm_handler = (message) => {
        resolve(message)

        this.off('_reply', _i3wm_handler)

        clearTimeout(timer)
      }

      this.on('_reply', _i3wm_handler)
    })
  }
}

/**
 * Some replies may fail. Throws if they do.
 */
const pipeSuccessReply = (reply) => {
  if (!reply.success) {
    throw new Error('Unsuccessful replied')
  }

  return reply
}

module.exports = {
  Client,
  ReplyTimeoutError,

  MESSAGES,
  REPLIES,
  Meta,

  getSocketPath,

  encodePayload,
  encodeMessage,
  encodeCommand,
}
