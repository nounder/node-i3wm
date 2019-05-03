const os = require('os')
const childProc = require('child_process')
const net = require('net')
const EventEmitter = require('events')

const MAGIC = 'i3-ipc'

/**
 * Message/reply format
 *     "i3-ipc" <message length> <message type> <payload>
 *
 * Length and types are u32.
 */

// Byes
const B_M = MAGIC.length
const B_N = 4 // long

// Offsets
const O_M = 0
const O_L = B_M // length
const O_T = B_M + B_N  // message type
const O_P = B_M + B_N + B_N // message payload

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

const EVENTS = [
  'workspace',
  'output',
  'mode',
  'window',
  'barconfig_update',
  'binding',
  'shutdown',
  'tick',
].reduce((a, v) => {
  return { ...a, [v]: v }
});

const EVENT_TYPES = {
  0: 'workspace',
  1: 'output',
  2: 'mode',
  3: 'window',
  4: 'barconfig_update',
  5: 'binding',
  6: 'shutdown',
  7: 'tick',
}

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
}

const MESSAGES_REPLIES = Object.values(REPLIES).reduce((a, v) => {
  return { ...a, [v]: v, }
}, {});

const Meta = Symbol('i3wm Meta')

const getSocketPath = async (bin = 'i3') => {
	return new Promise((resolve, reject) => {
    const cmd = [bin, '--get-socketpath']

		childProc.exec(cmd.join(' '), (err, stdout) => {
			if (err) {
				return reject(err);
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

const encodeMsg = (type, payload) => {
  const payloadData = encodePayload(payload)
  const length = Buffer.byteLength(payloadData, 'ascii')

	const b = Buffer.alloc(
		B_M +
		B_N + // length
    B_N + // type
    length
	);

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

  return encodeMsg(MESSAGES.RUN_COMMAND, payload)
}

/**
 * Reads u32 used in protocol.
 *
 * Integers are not converted by i3 so endiance must be checked.
 */
const readInt = (() => {
  const BUFFER_READ_INT_FN = 'readUInt32' + os.endianness();

  return (buffer, offset = 0) => {
    return buffer[BUFFER_READ_INT_FN](offset);
  }
})()

const decodeMessage = (data) => {
  const length = readInt(data, O_L)
  const rawType = readInt(data, O_T)
  const isEvent = rawType >>> 31 === 1 // highest-bit = 1 -> event
  const type = isEvent
        ? rawType ^ (1 << 31) // toggle highest-bit
        : rawType;
  const payload = data.slice(O_P, O_P + length).toString()
  const decoded = JSON.parse(payload)

  decoded[Meta] = {
    isEvent,
    type,
  }

  return decoded
}

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

    return client;
  }

  constructor() {
    super()

    this.on('_message', this._onMessage)
  }

  message(type, payload) {
    const data = encodeMsg(type, payload)

    this._write(data)

    return this._promiseImmidiateReplay()
  }

  command(command, ...payload) {
    const data = encodeCommand(command, ...payload)

    this._write(data)

    return this._promiseImmidiateReplay()
  }

  subscribe(...events) {
    return this.message(MESSAGES.SUBSCRIBE, events)
  }

  sync() {
    return this.message(MESSAGES.SYNC)
  }

  _onMessage() {
    this.on('_message', (message) => {
      const { type, isEvent } = message[Meta]

      if (isEvent) {
        const eventName = EVENT_TYPES[type]

        this.emit(eventName, message)
      } else {
        this.emit('_reply', message)
      }
    })
  }

  _write(data) {
    this.emit('_write', data)
  }

  _promiseImmidiateReplay() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Replay timeout'))
      }, 2000)

      // Crypting name to make it easy to identify handlers
      // added by this block.
      const _i3wm_handler = (message) => {
        if (message[Meta].isEvent) {
          return;
        }

        resolve(message);

        this.off('_message', _i3wm_handler)

        clearTimeout(timer);
      }

      this.on('_message', _i3wm_handler)
    });
  }
}

module.exports = {
  getSocketPath,
  encodeMsg,
  Client,
  MESSAGES,
  EVENTS,
  REPLIES,
}
