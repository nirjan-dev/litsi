import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const entry = fileURLToPath(new URL('../.output/server/index.mjs', import.meta.url));
const preload = fileURLToPath(new URL('./preload.mjs', import.meta.url));

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function stopHttp(server) {
  return new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

export async function startFixture(options) {
  const missingConfig = options !== undefined && options.missingConfig === true;
  try {
    await access(entry);
  } catch {
    throw new Error('Build missing: run pnpm build before pnpm test:built');
  }
  const attempts = [];
  const held = new Set();
  let mode = 'success';
  const provider = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        body = null;
      }
      const attempt = { path: req.url, method: req.method, headers: req.headers, body, mode };
      attempts.push(attempt);
      if (req.url !== '/v1/turn/keys/test-key/credentials/generate-ice-servers' || req.method !== 'POST') {
        res.writeHead(500);
        res.end('Unexpected provider request');
        return;
      }
      const respond = () => {
        held.delete(respond);
        if (res.destroyed) {
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        if (attempt.mode === 'failure') {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'private-provider-secret-details' }));
        } else {
          const n = attempts.indexOf(attempt) + 1;
          res.end(JSON.stringify({ iceServers: [
            { urls: ['stun:synthetic.invalid:3478'] },
            { urls: ['turn:synthetic.invalid:3478', 'turns:synthetic.invalid:5349'], username: 'user-' + n, credential: 'credential-' + n },
          ] }));
        }
      };
      if (mode === 'hold') {
        held.add(respond);
      } else {
        respond();
      }
    });
  });

  let child = null;
  let stopped = false;
  const sockets = new Set();
  let logs = '';

  async function close() {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    if (child !== null && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
      kill.unref();
      await exited;
      clearTimeout(kill);
    }
    await stopHttp(provider);
  }

  try {
    const providerPort = await listen(provider);
    const reservation = createServer();
    const port = await listen(reservation);
    await stopHttp(reservation);
    const url = 'http://127.0.0.1:' + port;
    const turnID = missingConfig ? '' : 'test-key';
    const turnToken = missingConfig ? '' : 'test-secret';
    child = spawn(process.execPath, ['--import', preload, entry], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        NITRO_HOST: '127.0.0.1',
        PORT: String(port),
        NITRO_PORT: String(port),
        NUXT_TURN_ID: turnID,
        NUXT_TURNID: turnID,
        NITRO_TURN_ID: turnID,
        NITRO_TURNID: turnID,
        NUXT_TURN_TOKEN: turnToken,
        NUXT_TURNTOKEN: turnToken,
        NITRO_TURN_TOKEN: turnToken,
        NITRO_TURNTOKEN: turnToken,
        LITSI_TEST_PROVIDER: 'http://127.0.0.1:' + providerPort,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    child.stdout.on('data', (data) => {
      logs = (logs + data).slice(-12000);
    });
    child.stderr.on('data', (data) => {
      logs = (logs + data).slice(-12000);
    });
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error('Server exited: ' + logs);
      }
      try {
        await fetch(url + '/api/getIceUrls', { signal: AbortSignal.timeout(300) });
        ready = true;
        break;
      } catch {
        // not ready yet
      }
      await delay(25);
    }
    if (!ready) {
      throw new Error('Server not ready: ' + logs);
    }

    let clockId = 0;
    let clockOffset = 0;
    function advance(milliseconds) {
      return new Promise((resolve, reject) => {
        clockId += 1;
        const id = clockId;
        const timer = setTimeout(() => {
          child.off('message', receive);
          reject(new Error('Clock IPC timeout'));
        }, 3000);
        function receive(message) {
          if (message === null || typeof message !== 'object') {
            return;
          }
          if (message.type !== 'clockAdvanced' || message.id !== id) {
            return;
          }
          clearTimeout(timer);
          child.off('message', receive);
          clockOffset += milliseconds;
          resolve(message.now);
        }
        child.on('message', receive);
        child.send({ type: 'advanceClock', milliseconds, id });
      });
    }

    async function connect(roomID, username) {
      const started = Date.now() + clockOffset;
      const ws = new WebSocket(url.replace('http:', 'ws:') + '/_ws?' + new URLSearchParams({ roomID, username }));
      sockets.add(ws);
      const messages = [];
      const waiters = new Set();
      ws.binaryType = 'arraybuffer';
      let decode = Promise.resolve();
      ws.addEventListener('message', (event) => {
        decode = decode.catch(() => {}).then(async () => {
          let text;
          const data = event.data;
          try {
            if (typeof data === 'string') {
              text = data;
            } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
              text = await data.text();
            } else if (data instanceof ArrayBuffer) {
              text = Buffer.from(data).toString('utf8');
            } else if (ArrayBuffer.isView(data)) {
              text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
            } else {
              text = String(data);
            }
          } catch {
            text = '[undecodable-frame]';
          }
          try {
            messages.push(JSON.parse(text));
          } catch {
            messages.push({ type: 'unparsed', payload: { raw: text } });
          }
          for (const waiter of waiters) {
            waiter();
          }
        });
      });
      function waitFor(predicate) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            waiters.delete(check);
            reject(new Error('WebSocket message timeout (' + username + '): ' + JSON.stringify(messages)));
          }, 4000);
          function check() {
            const found = messages.find(predicate);
            if (!found) {
              return;
            }
            clearTimeout(timer);
            waiters.delete(check);
            resolve(found);
          }
          waiters.add(check);
          check();
        });
      }
      const admitted = await waitFor((message) => message.type === 'sessionAdmitted');
      assert.equal(messages[0].type, 'sessionAdmitted', 'capability must precede presence events');
      assert.equal(typeof admitted.payload.capability, 'string');
      assert.ok(admitted.payload.capability.length >= 43, '32 bytes of opaque randomness');
      assert.equal(typeof admitted.payload.expiresAt, 'number');
      assert.ok(admitted.payload.expiresAt >= started + 3590000);
      assert.ok(admitted.payload.expiresAt <= Date.now() + clockOffset + 3601000);
      async function disconnect() {
        if (ws.readyState === WebSocket.CLOSED) {
          return;
        }
        const done = once(ws, 'close');
        ws.close();
        await done;
        sockets.delete(ws);
      }
      return { ws, messages, waitFor, disconnect, roomID, capability: admitted.payload.capability, expiresAt: admitted.payload.expiresAt };
    }

    function issue(session, overrides) {
      const opts = overrides || {};
      const roomID = opts.roomID !== undefined ? opts.roomID : (session === null || session === undefined ? undefined : session.roomID);
      const capability = opts.capability !== undefined ? opts.capability : (session === null || session === undefined ? undefined : session.capability);
      const method = opts.method !== undefined ? opts.method : 'POST';
      const headers = { 'Content-Type': 'application/json' };
      if (capability) {
        headers.Authorization = 'Bearer ' + capability;
      }
      if (opts.cookie) {
        headers.Cookie = opts.cookie;
      }
      let target = url + '/api/getIceUrls';
      if (opts.query) {
        target += '?' + opts.query;
      }
      const init = { method, headers, signal: AbortSignal.timeout(15000) };
      if (method === 'POST') {
        init.body = JSON.stringify({ roomID });
      }
      return fetch(target, init);
    }

    async function waitForAttempts(count) {
      for (let i = 0; i < 200 && attempts.length < count; i++) {
        await delay(10);
      }
      assert.equal(attempts.length, count);
    }

    function setMode(value) {
      mode = value;
    }

    function release() {
      for (const respond of Array.from(held)) {
        respond();
      }
    }

    function now() {
      return Date.now() + clockOffset;
    }

    return { url, attempts, connect, issue, advance, close, waitForAttempts, setMode, release, now };
  } catch (error) {
    await close();
    throw error;
  }
}

// Browser reuse (no rebuild): node test/fixture.mjs prints a URL for manual smoke.
// Runs the real bundle with synthetic TURN only. Close with Ctrl-C.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startFixture();
  console.log('Synthetic TURN browser fixture: ' + fixture.url);
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      await fixture.close();
      process.exit(0);
    });
  }
}
