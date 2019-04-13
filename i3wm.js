const os = require('os')
const childProc = require('child_process')
const net = require('net')

const MAGIC = 'i3-ipc'

// Byes
const B_M = MAGIC.length
const B_N = 8 // long

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
  const length = Buffer.byteLength(payloadData, 'ascii')

	const b = Buffer.alloc(
		B_M +
		B_N + // length
    B_N + // type
		payloadData.length
	);

	b.write(MAGIC, O_M, 'ascii')
	b.writeUInt32LE(payloadData.length, O_L)
	b.writeUInt32LE(type, O_T)
	b.write(payloadData, O_P, 'ascii')

  console.log('------buffer', b.toString('hex'))

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
 * Reads unsigned 32-bit integer used in protocol.
 *
 * Integers are not converted.
 * Its format are platform-specific.
 */
const readInt = (buffer, offset = 0) => {
  return os.endianness() === 'LE'
    ? buffer.readUInt32LE(offset)
    : buffer.readUInt32BE(offset);
};

const decodeMessage = (data) => {
  const type = readInt(data, B_M + 1)
  const length = readInt(data, O_L)
  const payload = data.slice(O_P - 8).toString()

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
		//client.write(encodeMsg(MSG_TYPES.GET_WORKSPACES, ['workspace']))
	})


	client.on('data', (data) => {
    console.group('Response')
		console.log('data', data.toString());
		console.log(decodeMessage(data))
    console.groupEnd('Response')
	})
};

module.exports = {
  i3,
  encodeMsg,
  debug,
}
