// Incremental SSE framing: CR, LF, CRLF, split UTF-8, comments and multiline data.
export async function consumeSSE(body, onEvent) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', event = '', data = [], size = 0;
  const dispatch = () => {
    if (data.length) {
      const payload = JSON.parse(data.join('\n'));
      onEvent(event || 'message', payload);
    }
    event = ''; data = []; size = 0;
  };
  const line = value => {
    if (!value) return dispatch();
    if (value[0] === ':') return;
    const colon = value.indexOf(':');
    const field = colon < 0 ? value : value.slice(0, colon);
    let content = colon < 0 ? '' : value.slice(colon + 1);
    if (content[0] === ' ') content = content.slice(1);
    if (field === 'event') event = content;
    if (field === 'data') {
      size += content.length;
      if (size > 2_000_000) throw new Error('SSE event too large');
      data.push(content);
    }
  };
  const drain = final => {
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] !== '\r' && buffer[i] !== '\n') continue;
      if (buffer[i] === '\r' && i + 1 === buffer.length && !final) break;
      line(buffer.slice(start, i));
      if (buffer[i] === '\r' && buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    buffer = buffer.slice(start);
    if (buffer.length > 2_000_000) throw new Error('SSE event too large');
    if (final) { if (buffer) line(buffer); dispatch(); }
  };
  try {
    for (;;) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      drain(done);
      if (done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
