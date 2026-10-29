// Test-process only: no product runtime hooks or real provider access.
const providerEnv = process.env.LITSI_TEST_PROVIDER;
const provider = new URL(providerEnv || 'about:blank');
const realNow = Date.now.bind(Date);
const originalFetch = globalThis.fetch.bind(globalThis);
let offset = 0;

if (!providerEnv || provider.hostname !== '127.0.0.1' || provider.protocol !== 'http:') {
  throw new Error('The synthetic provider must use loopback HTTP');
}

const OriginalDate = Date;
class ShiftedDate extends OriginalDate {
  constructor(...args) {
    if (args.length === 0) {
      super(realNow() + offset);
    } else {
      super(...args);
    }
  }
  static now() {
    return realNow() + offset;
  }
}
globalThis.Date = ShiftedDate;

globalThis.fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || url.hostname !== 'rtc.live.cloudflare.com') {
    throw new Error('Unexpected outbound fetch blocked: ' + url.origin);
  }
  const target = new URL(url.pathname + url.search, provider);
  return request.text().then(
    (body) => originalFetch(target, {
      method: request.method,
      headers: request.headers,
      body: body === '' ? undefined : body,
      signal: request.signal,
    }),
    () => originalFetch(target, { method: request.method, headers: request.headers, signal: request.signal }),
  );
};

// Only forward artificial clock advances; never other IPC.
process.on('message', (message) => {
  if (message === null || typeof message !== 'object') {
    return;
  }
  if (message.type === 'advanceClock' && Number.isFinite(message.milliseconds)) {
    offset += message.milliseconds;
    if (process.send) {
      process.send({ type: 'clockAdvanced', id: message.id, now: Date.now() });
    }
  }
});
