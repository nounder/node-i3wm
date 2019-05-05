# i3 window manager + Node.js

This Node.js package allows to talk with i3 window manager using [IPC interface](0).

No dependencies, no unecessary abstractions. Just simple, modern API.

Source code is only [one file](i3wm.js) with clear comments and references to
excellent [i3wm docs](1).

## Install

```
npm install i3wm
```

## Examples

### Connect to i3

```js
const i3wm = require('i3wm')

i3wm.Client.connect().then(client => {
  console.log('Conneceted')
})

// or

const client = await i3wm.Client.connect()
```

You can also use custom binary by passing additional options to `connect`. For example: `connect({ bin: 'sway' })`.

### Subscribe to events

```js
client.subscribe('window', 'workspace')

client.on('window', msg => {
  if (msg.change === 'focus') {
    console.log('Jumping around')
  }
})
```
### Messages

```js
// Subscribe, payload is serialized
await client.message('subscribe', ['window'])

// Get tree of all windows and workspaces
const tree = await client.message('get_tree')

// send multiple commands in one go
const [r1, r2] = await client.message('run_command', 'workspace 0; mark m')
```

Possible messages can be found in [source code](i3wm.js) and `man i3-msg`.

### Commands

Use `command()` to send a command and get unwraped reply.

```js
// Mark current window with 'm'
await client.command('mark m')

// command() throws on incorrect input
client.command('BLAH')
  .catch(err => console.log('Incorrect: ': err.input))
```

### Disconnect

```js
i3wm.Client.disconnect(client)
```

[0]: https://i3wm.org/docs/ipc.html
[1]: https://i3wm.org/docs/
