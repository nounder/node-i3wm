const os = require('os')
const childProc = require('child_process')
const net = require('net')

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


const MSG_TYPES = {
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

const REPLY_TYPE = {
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

const i3 = {
	getSocketPath: async () => {
		return new Promise((resolve, reject) => {
			childProc.exec('i3 --get-socketpath', (err, stdout) => {
				if (err) {
					return reject(err);
				}

				resolve(stdout.toString().trim())
			});
		});
	}
}

const encodePayload = (data) => {
  return typeof data === 'object'
		? JSON.stringify(data)
		: String(data)
}

const encodeMsg = (type, payload) => {
  const payloadData = encodePayload(payload)
  const length = Buffer.byteLength(payloadData, 'ascii');

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

  console.log(b.toString('hex'))

	return b
}

const encodeCommand = (cmd, ...args) => {
	const _args = args.map(encodePayload)

  const payload = _args.length > 0
        ? [cmd, ..._args].join(' ')
        : cmd

  return encodeMsg(MSG_TYPES.RUN_COMMAND, payload)
}

/**
 * Reads u32 used in protocol.
 *
 * Integers are not converted by i3 so endiance must be checked.
 */
const BUFFER_READ_INT_FN = os.endianness() === 'LE'
      ? 'readUInt32LE'
      : 'readUInt32BE';

const readInt = (buffer, offset = 0) => {
  return buffer[BUFFER_READ_INT_FN](offset);
};

const decodeMessage = (data) => {
  const type = readInt(data, O_T)
  const length = readInt(data, O_L)
  const payload = data.slice(O_P, O_P + length).toString()

  return {
    type,
    length,
    payload,
  }
}

const debug = async () => {
	const sockFile = await i3.getSocketPath()
	const client = net.createConnection(sockFile)

	client.on('connect', () => {
		client.write(encodeCommand('mark m'))
	})


	client.on('data', (data) => {
    console.group('Replay')
		console.log('data', data.toString());
		console.log(decodeMessage(data))
    console.groupEnd('Replay')
	})
};

module.exports = {
  i3,
  encodeMsg,
  debug,
}
