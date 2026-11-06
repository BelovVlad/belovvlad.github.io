import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeSSE} from '../sse.js';
const stream = bytes => new ReadableStream({start(c) { for (const b of bytes) c.enqueue(b); c.close(); }});
test('SSE survives every byte boundary, CRLF, comments, multiline JSON and final unterminated event', async () => {
  const bytes = new TextEncoder().encode(': ping\r\nevent: sources\r\ndata: {"items":\r\ndata: []}\r\n\r\nevent: delta\ndata: {"t":"Привет $\\\\alpha$"}\n\nevent: done\rdata: {}');
  const events = [];
  await consumeSSE(stream(Array.from(bytes, b => new Uint8Array([b]))), (event, data) => events.push([event, data]));
  assert.deepEqual(events, [['sources', {items:[]}], ['delta',{t:'Привет $\\alpha$'}], ['done',{}]]);
});
test('malformed data fails instead of silently losing part of the answer', async () => {
  await assert.rejects(consumeSSE(stream([new TextEncoder().encode('event: delta\ndata: {bad}\n\n')]), () => {}), SyntaxError);
});
