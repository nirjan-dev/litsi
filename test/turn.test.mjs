import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { startFixture } from './fixture.mjs';

// Run against a previously built bundle: pnpm test:built
// Each scenario owns a fresh process, provider budget, and loopback fixture.
async function fixture(t, options) {
  const app = await startFixture(options);
  t.after(() => app.close());
  return app;
}

async function status(response, expected) {
  assert.equal(response.status, expected, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

async function granted(response) {
  await status(response, 200);
  const payload = await response.json();
  assert.ok(Array.isArray(payload.iceServers));
  assert.equal(payload.iceServers.length, 2);
  assert.deepEqual(payload.iceServers[0], { urls: ['stun:synthetic.invalid:3478'] });
  assert.deepEqual(payload.iceServers[1].urls, ['turn:synthetic.invalid:3478', 'turns:synthetic.invalid:5349']);
  assert.match(payload.iceServers[1].username, /^user-\d+$/);
  assert.match(payload.iceServers[1].credential, /^credential-\d+$/);
  assert.equal(typeof payload.expiresAt, 'number');
  return payload;
}

function limited(response, retryAfter) {
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('retry-after') || '', /^\d+$/);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  if (retryAfter !== undefined) {
    assert.equal(response.headers.get('retry-after'), String(retryAfter));
  }
}

test('anonymous, forged, cross-room and non-POST issuance attempts never reach provider', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('room', 'alice');
  const bob = await app.connect('room', 'bob');

  await status(await app.issue(alice, { capability: '' }), 401);
  await status(await app.issue(alice, { capability: 'forged' }), 401);
  await status(await app.issue(alice, { roomID: 'different-room' }), 401);
  const getResponse = await app.issue(alice, { method: 'GET' });
  await status(getResponse, 405);
  assert.equal(getResponse.headers.get('allow'), 'POST');
  const putResponse = await app.issue(alice, { method: 'PUT' });
  await status(putResponse, 405);
  assert.equal(putResponse.headers.get('allow'), 'POST');
  // Capability must only be honored as an Authorization bearer token.
  await status(await app.issue(null, { roomID: 'room', cookie: 'capability=' + alice.capability, query: 'capability=' + alice.capability }), 401);
  assert.equal(app.attempts.length, 0);

  const credentials = await granted(await app.issue(alice));
  assert.ok(credentials.expiresAt >= app.now() + 3590000);
  assert.ok(credentials.expiresAt <= app.now() + 3601000);
  assert.equal(app.attempts.length, 1);
  assert.deepEqual(app.attempts[0].body, { ttl: 3600 });
  assert.equal(app.attempts[0].headers.authorization, 'Bearer test-secret');

  // Same bearer credential is reusable in the same session.
  assert.deepEqual(await granted(await app.issue(alice)), credentials);
  assert.equal(app.attempts.length, 1);
  assert.notEqual(bob.capability, alice.capability);
});

test('three peers retain normal signaling while credentials stay private and session-reusable', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('meeting', 'alice');
  const bob = await app.connect('meeting', 'bob');
  await alice.waitFor((m) => m.type === 'newCallerJoined' && m.payload.username === 'bob');
  const carol = await app.connect('meeting', 'carol');
  const peers = [alice, bob, carol];

  for (const peer of peers) {
    await peer.waitFor((m) => m.type === 'usersListUpdate' && Array.isArray(m.payload.usersList) && m.payload.usersList.length === 3);
    assert.equal(peer.messages.filter((m) => m.type === 'sessionAdmitted').length, 1);
  }
  assert.equal(new Set(peers.map((peer) => peer.capability)).size, 3);
  for (const peer of peers) {
    for (const other of peers) {
      if (other !== peer) {
        assert.equal(JSON.stringify(peer.messages).includes(other.capability), false);
      }
    }
  }

  bob.ws.send(JSON.stringify({ type: 'newCallerReceived', payload: { username: 'alice' } }));
  await alice.waitFor((m) => m.type === 'newCallerReceived' && m.payload.username === 'bob');
  alice.ws.send(JSON.stringify({ type: 'signal', payload: { username: 'bob', signal: { type: 'offer', sdp: 'synthetic-offer' } } }));
  const signal = await bob.waitFor((m) => m.type === 'signal');
  assert.deepEqual(signal.payload, { username: 'alice', signal: { type: 'offer', sdp: 'synthetic-offer' } });
  carol.ws.send(JSON.stringify({ type: 'message', payload: { message: 'three participants' } }));
  for (const peer of peers) {
    await peer.waitFor((m) => m.type === 'message' && m.payload.message === 'three participants');
  }

  app.setMode('hold');
  const concurrent = [app.issue(alice), app.issue(alice), app.issue(alice)];
  await app.waitForAttempts(1);
  // Same-second coalesced requests must all overlap before the provider answers.
  await delay(50);
  app.release();
  const resolved = await Promise.all(concurrent);
  const issued = [];
  for (const response of resolved) {
    issued.push(await granted(response));
  }
  assert.deepEqual(issued[0], issued[1]);
  assert.deepEqual(issued[1], issued[2]);
  assert.equal(app.attempts.length, 1);
  app.setMode('success');

  await granted(await app.issue(bob));
  await granted(await app.issue(carol));
  assert.equal(app.attempts.length, 3, 'each participant can obtain their own session credentials');
  assert.deepEqual(await granted(await app.issue(alice)), issued[0]);
  assert.equal(app.attempts.length, 3, 'additional peers do not force Alice to issue again');
});

test('session HTTP rate includes cache hits, exposes full-window Retry-After and recovers', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const session = await app.connect('rate-room', 'alice');
  const first = await granted(await app.issue(session));
  for (let i = 1; i < 12; i++) {
    assert.deepEqual(await granted(await app.issue(session)), first);
  }
  limited(await app.issue(session), 60);
  assert.equal(app.attempts.length, 1);
  await app.advance(60001);
  assert.deepEqual(await granted(await app.issue(session)), first);
  assert.equal(app.attempts.length, 1);
});

test('revoking a socket denies pending, coalesced and subsequent issuance; reconnect is fresh', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const session = await app.connect('revocation', 'alice');
  const watcher = await app.connect('revocation', 'watcher');
  app.setMode('hold');
  const pending = [app.issue(session), app.issue(session)];
  await app.waitForAttempts(1);
  await delay(50);
  await session.disconnect();
  // Wait until the server has processed the socket close before releasing.
  await watcher.waitFor((m) => m.type === 'usersListUpdate' && !m.payload.usersList.includes('alice'));
  const replacement = await app.connect('revocation', 'replacement');
  assert.notEqual(replacement.capability, session.capability);
  app.release();
  await status(await pending[0], 401);
  await status(await pending[1], 401);
  await status(await app.issue(session), 401);
  await delay(30);
  assert.equal(app.attempts.length, 1);
  app.setMode('success');
  await granted(await app.issue(replacement));
  // Replacement issuance is a second provider call, not the revoked pending result.
  assert.equal(app.attempts.length, 2);
});

test('one-hour session expiry forbids issuance even with a live socket', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const session = await app.connect('expiry', 'alice');
  await granted(await app.issue(session));
  await app.advance(3600001);
  await status(await app.issue(session), 401);
  assert.equal(app.attempts.length, 1);
});

test('cached credentials refresh at provider expiry minus sixty seconds, not earlier', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const session = await app.connect('refresh', 'alice');
  const initial = await granted(await app.issue(session));
  await app.advance(55 * 60000);
  assert.deepEqual(await granted(await app.issue(session)), initial);
  await app.advance(3 * 60000);
  assert.deepEqual(await granted(await app.issue(session)), initial);
  assert.equal(app.attempts.length, 1);
  await app.advance(60001);
  const refreshed = await granted(await app.issue(session));
  assert.notEqual(refreshed.iceServers[1].credential, initial.iceServers[1].credential);
  assert.ok(refreshed.expiresAt > initial.expiresAt);
  assert.equal(app.attempts.length, 2);
});

test('provider failures are sanitized, never retried and enforce the session cooldown', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const session = await app.connect('failure', 'alice');
  app.setMode('failure');
  const failure = await app.issue(session);
  await status(failure, 502);
  const body = await failure.text();
  assert.equal(body.includes('private-provider-secret-details'), false);
  assert.equal(body.includes('test-secret'), false);
  assert.equal(body.includes('test-key'), false);
  assert.equal(app.attempts.length, 1, 'provider failure must not trigger fetch retry');
  limited(await app.issue(session), 30);
  assert.equal(app.attempts.length, 1);
  await app.advance(30001);
  app.setMode('success');
  await granted(await app.issue(session));
  assert.equal(app.attempts.length, 2);
});

test('global provider-attempt budget spans rooms, reconnects and failures, and rolls over', { timeout: 30000 }, async (t) => {
  const app = await fixture(t);
  for (let i = 0; i < 60; i++) {
    const session = await app.connect('budget-' + (i % 3), 'reconnecting-user');
    app.setMode(i % 2 === 0 ? 'failure' : 'success');
    const response = await app.issue(session);
    await status(response, i % 2 === 0 ? 502 : 200);
    await session.disconnect();
  }
  assert.equal(app.attempts.length, 60);
  const denied = await app.connect('entirely-new-room', 'new-user');
  limited(await app.issue(denied));
  assert.equal(app.attempts.length, 60, '61st attempt must never reach the provider');
  await app.advance(3600001);
  // The previous capability expires too: admission after rollover is required.
  const renewed = await app.connect('after-rollover', 'new-user');
  app.setMode('success');
  await granted(await app.issue(renewed));
  assert.equal(app.attempts.length, 61);
});

test('missing private provider configuration returns unavailable without contacting provider', { timeout: 20000 }, async (t) => {
  const app = await fixture(t, { missingConfig: true });
  const session = await app.connect('configuration', 'alice');
  await status(await app.issue(session), 503);
  assert.equal(app.attempts.length, 0);
});
