const assert = require('assert');
const i3wm = require('./i3wm')

assert(
  i3wm.encodeMsg(0, 'exit').toString('hex'),
  '69332d697063040000000000000065786974',
);

console.log('All tests passed!')
