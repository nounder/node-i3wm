# i3 window manager + Node.js

This Node.js package allows to talk with i3 window manager using [IPC interface](0).

No dependencies, no unecessary abstractions. Just simple, modern API.

Source code is only [one file](i3wm.js) with clear comments and references to
excellent [i3wm docs](1).

## Examples

### Connect to i3

```js
const i3wm = require('i3wm')

i3wm.connect().then(client => {
  console.log('Conneceted')
})

// or

const client = await i3wm.connect()
```

You can also pass `{ bin: 'sway' }` to `connect` to use custom binary.

### Subscribe to events

```js
client.subscribe('window', 'workspace')

client.on('window', msg => {
  if (msg.change === 'focus') {
    console.log('Jumping around')
  }
})
```

### Send commands or messagges

```js
// Mark current window with 'm'
await client.command('mark m')

// Subscribe, payload is serialized
await client.command('subscribe', ['window'])

// Get tree of all windows and workspaces
const tree = await client.message('get_tree')
```

Possible messages can be found in [source code](i3wm.js) and `man i3-msg`.

[0]: https://i3wm.org/docs/ipc.html
[1]: https://i3wm.org/docs/
