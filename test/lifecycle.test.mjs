import test from 'node:test';
import assert from 'node:assert/strict';
import { startFixture } from './fixture.mjs';

// Black-box protocol tests against the same built Nitro bundle as turn.test.mjs.
async function fixture(t) {
  const app = await startFixture();
  t.after(() => app.close());
  return app;
}

function send(peer, type, payload) {
  peer.ws.send(JSON.stringify({ type, payload }));
}

async function barrier(peer, label) {
  send(peer, 'message', { message: label });
  await peer.waitFor((event) => event.type === 'message' && event.payload.message === label);
}

function users(peer, names) {
  return peer.waitFor((event) => event.type === 'usersListUpdate' &&
    JSON.stringify(event.payload.usersList) === JSON.stringify(names));
}

async function refused(app, roomID, username, code, onOpen) {
  const peer = await app.connect(roomID, username, { admit: false, onOpen });
  const error = await peer.waitFor((event) => event.type === 'roomError');
  assert.equal(error.payload.code, code);
  assert.equal(typeof error.payload.message, 'string');
  const close = await peer.closed;
  await peer.drained();
  assert.equal(close.code, 1008);
  assert.equal(close.reason, error.payload.message);
  assert.deepEqual(peer.messages, [error], 'refused sockets receive no capability or room events');
  return peer;
}

test('duplicate normalized name is refused without evicting or impersonating the original', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('names', '  alice  ');
  const bob = await app.connect('names', 'bob');
  await users(bob, ['alice', 'bob']);
  const before = bob.messages.length;
  await refused(app, 'names', 'alice', 'name_taken', (ws) => {
    for (const event of [
      { type: 'message', payload: { username: 'alice', message: 'intruder' } },
      { type: 'signal', payload: { username: 'bob', signal: { type: 'offer', sdp: 'intruder' } } },
      { type: 'mediaState', payload: { audio: true, video: true, screenStreamID: 'intruder' } },
    ]) ws.send(JSON.stringify(event));
  });
  await barrier(bob, 'after-refusal');
  assert.equal(bob.messages.slice(before).some((event) => event.type !== 'message' || event.payload.message !== 'after-refusal'), false);
  send(alice, 'signal', { username: 'bob', signal: { type: 'offer', sdp: 'original-still-live' } });
  await bob.waitFor((event) => event.type === 'signal' && event.payload.signal.sdp === 'original-still-live');
  assert.equal((await app.issue(alice)).status, 200);
  assert.equal(app.attempts.length, 1);
  await alice.disconnect();
  await users(bob, ['bob']);
  assert.equal((await app.issue(alice)).status, 401);
  const replacement = await app.connect('names', 'alice');
  await users(bob, ['bob', 'alice']);
  assert.notEqual(replacement.capability, alice.capability);
  await barrier(replacement, 'replacement-live');
  assert.equal(bob.messages.filter((event) => event.type === 'usersListUpdate' && event.payload.usersList.length === 1).length, 1);
});

test('room and trimmed display-name validation rejects before admission', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  for (const roomID of ['', 'bad/room', 'bad room', 'a'.repeat(101)]) {
    await refused(app, roomID, 'alice', 'invalid_room');
  }
  for (const username of ['', '   ', 'a'.repeat(41)]) {
    await refused(app, 'valid-room', username, 'invalid_name');
  }
  const edge = await app.connect('A_9-' + 'a'.repeat(96), 'n'.repeat(40));
  await users(edge, ['n'.repeat(40)]);
  assert.equal(app.attempts.length, 0);
});

test('directed signaling stays in its room and chat sender is admitted identity', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('one', 'alice');
  const bob = await app.connect('one', 'bob');
  const bystander = await app.connect('one', 'bystander');
  const outsider = await app.connect('two', 'outsider');
  const foreignBob = await app.connect('two', 'bob');
  send(alice, 'signal', { username: 'bob', signal: { type: 'offer', sdp: 'same-room' } });
  assert.deepEqual((await bob.waitFor((event) => event.type === 'signal')).payload, {
    username: 'alice', signal: { type: 'offer', sdp: 'same-room' },
  });
  send(bob, 'newCallerReceived', { username: 'alice' });
  await alice.waitFor((event) => event.type === 'newCallerReceived' && event.payload.username === 'bob');
  send(alice, 'signal', { username: 'outsider', signal: { type: 'offer', sdp: 'cross-room' } });
  send(alice, 'newCallerReceived', { username: 'outsider' });
  send(alice, 'message', { username: 'forged', message: 'room-chat' });
  for (const peer of [alice, bob, bystander]) {
    const event = await peer.waitFor((event) => event.type === 'message' && event.payload.message === 'room-chat');
    assert.equal(event.payload.username, 'alice');
  }
  for (const peer of [bystander, outsider, foreignBob]) {
    await barrier(peer, 'drained-' + peer.roomID + '-' + (peer === foreignBob ? 'bob' : 'other'));
    assert.equal(peer.messages.some((event) => event.type === 'signal' || event.type === 'newCallerReceived'), false);
  }
  assert.equal(outsider.messages.some((event) => event.type === 'message' && event.payload.message === 'room-chat'), false);
  assert.equal(foreignBob.messages.some((event) => event.type === 'message' && event.payload.message === 'room-chat'), false);
});

test('malformed envelopes and invalid fields are ignored without breaking the room', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('malformed', 'alice');
  const bob = await app.connect('malformed', 'bob');
  await users(bob, ['alice', 'bob']);
  const before = bob.messages.length;
  for (const frame of ['{', 'null', '[]', '1', '"hello"', '{}',
    '{"type":"message"}', '{"type":"message","payload":null}',
    '{"type":"message","payload":{"message":{}}}',
    '{"type":"signal","payload":{"username":"bob","signal":null}}',
    '{"type":"signal","payload":{"username":"bob","signal":[]}}',
    '{"type":"newCallerReceived","payload":{"username":1}}',
    '{"type":"unknown","payload":{}}']) alice.ws.send(frame);
  await barrier(alice, 'malformed-processed');
  await barrier(bob, 'bob-drained');
  assert.deepEqual(bob.messages.slice(before).map((event) => [event.type, event.payload.message]), [
    ['message', 'malformed-processed'], ['message', 'bob-drained'],
  ]);
  send(alice, 'signal', { username: 'bob', signal: { candidate: 'still-working' } });
  await bob.waitFor((event) => event.type === 'signal' && event.payload.signal.candidate === 'still-working');
});

test('media state validates fields, ignores spoofed identity and snapshots existing members', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('media', 'alice');
  const initial = await users(alice, ['alice']);
  assert.deepEqual(initial.payload.mediaStates, [{ username: 'alice', audio: false, video: false, screenStreamID: null }]);
  const bob = await app.connect('media', 'bob');
  const outsider = await app.connect('elsewhere', 'outsider');
  const state = { audio: true, video: false, screenStreamID: 'screen-1' };
  send(alice, 'mediaState', { username: 'bob', ...state, capability: alice.capability, extra: 'discard' });
  for (const peer of [alice, bob]) {
    assert.deepEqual((await peer.waitFor((event) => event.type === 'mediaState')).payload, { username: 'alice', ...state });
  }
  for (const invalid of [
    { audio: 'true', video: true, screenStreamID: null },
    { audio: true, video: 1, screenStreamID: null },
    { audio: true, video: true, screenStreamID: {} },
    { audio: true, video: true },
  ]) send(alice, 'mediaState', invalid);
  await barrier(alice, 'invalid-media-processed');
  await barrier(bob, 'invalid-media-drained');
  assert.equal(bob.messages.filter((event) => event.type === 'mediaState').length, 1);
  const carol = await app.connect('media', 'carol');
  const snapshot = await users(carol, ['alice', 'bob', 'carol']);
  assert.deepEqual(snapshot.payload.mediaStates, [
    { username: 'alice', ...state },
    { username: 'bob', audio: false, video: false, screenStreamID: null },
    { username: 'carol', audio: false, video: false, screenStreamID: null },
  ]);
  send(alice, 'mediaState', { audio: false, video: true, screenStreamID: null });
  await bob.waitFor((event) => event.type === 'mediaState' && event.payload.screenStreamID === null);
  await barrier(outsider, 'outside-drained');
  assert.equal(outsider.messages.some((event) => event.type === 'mediaState'), false);
});

test('transport error removes only its member and delayed close cannot evict readmission', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const watcher = await app.connect('error-room', 'watcher');
  const raw = await app.connectTransport('error-room', 'alice');
  await users(watcher, ['watcher', 'alice']);
  // Client frames MUST be masked. This unmasked text frame makes the real
  // adapter emit error before its close handshake completes.
  raw.write(Buffer.from([0x81, 0x00]));
  await users(watcher, ['watcher']);
  const alice = await app.connect('error-room', 'alice');
  await users(alice, ['watcher', 'alice']);
  // Finish the failed transport only after the new same-name peer is admitted.
  raw.destroy();
  await barrier(alice, 'new-alice-live');
  await barrier(watcher, 'watcher-drained');
  send(alice, 'signal', { username: 'watcher', signal: { candidate: 'replacement' } });
  await watcher.waitFor((event) => event.type === 'signal' && event.payload.signal.candidate === 'replacement');
  assert.equal(watcher.messages.filter((event) => event.type === 'usersListUpdate' && event.payload.usersList.length === 1).length, 2,
    'initial membership and error removal only; stale close must not broadcast a removal');
  assert.equal((await app.issue(alice)).status, 200);
});

test('last departure clears presence and media state before room reuse', { timeout: 20000 }, async (t) => {
  const app = await fixture(t);
  const alice = await app.connect('reuse', 'alice');
  send(alice, 'mediaState', { audio: true, video: true, screenStreamID: 'old-screen' });
  await alice.waitFor((event) => event.type === 'mediaState');
  await alice.disconnect();
  // Revocation is a server-processed-close barrier, not a timer-based assumption.
  assert.equal((await app.issue(alice)).status, 401);
  const fresh = await app.connect('reuse', 'alice');
  assert.notEqual(fresh.capability, alice.capability);
  const snapshot = await users(fresh, ['alice']);
  assert.deepEqual(snapshot.payload.mediaStates, [{ username: 'alice', audio: false, video: false, screenStreamID: null }]);
  assert.equal(fresh.messages.some((event) => event.type === 'newCallerJoined'), false);
  const bob = await app.connect('reuse', 'bob');
  await users(fresh, ['alice', 'bob']);
  await users(bob, ['alice', 'bob']);
});
