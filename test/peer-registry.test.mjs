import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeerRegistry } from '../utils/peerRegistry.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function peer() {
  return { received: [], destroyed: false, signal(value) { this.received.push(value); }, destroy() { this.destroyed = true; } };
}

test('signals arriving before or during ICE setup are delivered in order, to one peer', async () => {
  const pending = deferred();
  let creations = 0;
  const registry = createPeerRegistry(async () => { creations++; return pending.promise; });
  registry.signal('alice', { type: 'offer' });
  const first = registry.ensure('alice', false);
  const duplicate = registry.ensure('alice', false);
  registry.signal('alice', { candidate: 'early' });
  const connected = peer();
  pending.resolve(connected);
  assert.equal(await first, connected);
  assert.equal(await duplicate, connected);
  assert.equal(creations, 1);
  registry.signal('alice', { candidate: 'late' });
  assert.deepEqual(connected.received, [{ type: 'offer' }, { candidate: 'early' }, { candidate: 'late' }]);
});

test('a departed peer finishing asynchronous setup cannot resurrect or replace its namesake', async () => {
  const pending = deferred();
  const original = peer();
  const replacement = peer();
  let calls = 0;
  const registry = createPeerRegistry(() => ++calls === 1 ? pending.promise : replacement);
  const stale = registry.ensure('alice', false);
  await Promise.resolve();
  registry.remove('alice');
  assert.equal(await registry.ensure('alice', true), replacement);
  pending.resolve(original);
  assert.equal(await stale, null);
  assert.equal(original.destroyed, true);
  assert.equal(registry.get('alice'), replacement);
  assert.equal(replacement.destroyed, false);
});

test('a stale close callback cannot destroy a newer connection with the same name', async () => {
  let next = peer();
  const registry = createPeerRegistry(() => next);
  const original = await registry.ensure('alice', true);
  registry.remove('alice', original);
  next = peer();
  const replacement = await registry.ensure('alice', false);
  registry.remove('alice', original);
  assert.equal(registry.get('alice'), replacement);
  assert.equal(replacement.destroyed, false);
});

test('membership removal drops queued signals as well as connected peers', async () => {
  const registry = createPeerRegistry(() => peer());
  const alice = await registry.ensure('alice', true);
  registry.signal('bob', { type: 'obsolete-offer' });
  registry.retain(['bob']);
  assert.equal(alice.destroyed, true);
  registry.retain([]);
  const bob = await registry.ensure('bob', false);
  assert.deepEqual(bob.received, []);
  registry.clear();
  assert.equal(bob.destroyed, true);
  assert.equal(registry.get('bob'), undefined);
});

test('failed setup releases its reservation so explicit readmission can create a peer', async () => {
  let fail = true;
  const registry = createPeerRegistry(() => {
    if (fail) throw new Error('provider unavailable');
    return peer();
  });
  await assert.rejects(registry.ensure('alice', true), /provider unavailable/);
  fail = false;
  const connected = await registry.ensure('alice', true);
  registry.signal('alice', { type: 'answer' });
  assert.deepEqual(connected.received, [{ type: 'answer' }]);
});
