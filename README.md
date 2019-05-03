# i3 window manager + Node.js

This package allows to talk with i3 window manager using [IPC interface](0).
No dependencies, no unecessary abstractions. Just simple, modern API.

## Examples

## Connect to i3

```
const i3wm = require('i3wm')

i3wm.connect().then((client) => {
  console.log('Conneceted')
})

// or

const client = await i3wm.connect()
```

## Subscribe to events

```
client.subscribe('window', 'workspace')

client.on('window', (msg) => {
  if (msg.change === 'focus') {
    console.log('Jumping around')
  }
})
```

## Send commands or messagges

```
// Mark current window to 'm'
await client.command('mark m')

// Get tree of all windows and workspaces
const tree = await client.message('get_tree')
```

[0]: https://i3wm.org/docs/ipc.html
