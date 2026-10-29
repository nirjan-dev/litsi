// A peer can receive signals before asynchronous ICE setup finishes. This
// registry owns that gap and prevents an old setup/close from replacing a new one.
export function createPeerRegistry(createPeer) {
  const entries = new Map();

  function entryFor(name) {
    if (!entries.has(name)) entries.set(name, { peer: null, signals: [], creating: null });
    return entries.get(name);
  }

  async function ensure(name, initiator) {
    const entry = entryFor(name);
    if (entry.peer) return entry.peer;
    if (!entry.creating) {
      entry.creating = Promise.resolve().then(() => createPeer(name, initiator)).then((peer) => {
        if (entries.get(name) !== entry) {
          peer.destroy();
          return null;
        }
        entry.peer = peer;
        const signals = entry.signals;
        entry.signals = [];
        for (const signal of signals) {
          if (entries.get(name) !== entry) break;
          peer.signal(signal);
        }
        return peer;
      }).catch((error) => {
        if (entries.get(name) === entry) remove(name);
        throw error;
      });
    }
    return entry.creating;
  }

  function signal(name, data) {
    const entry = entryFor(name);
    if (entry.peer) entry.peer.signal(data);
    else entry.signals.push(data);
  }

  function remove(name, expectedPeer) {
    const entry = entries.get(name);
    if (!entry || (expectedPeer && entry.peer !== expectedPeer)) return;
    entries.delete(name);
    entry.peer?.destroy();
  }

  function retain(names) {
    const present = new Set(names);
    for (const name of entries.keys()) {
      if (!present.has(name)) remove(name);
    }
  }

  function forEach(visit) {
    for (const [name, entry] of entries) {
      if (entry.peer) visit(entry.peer, name);
    }
  }

  function clear() {
    const peers = Array.from(entries.values(), (entry) => entry.peer);
    entries.clear();
    for (const peer of peers) peer?.destroy();
  }

  return { ensure, signal, remove, retain, forEach, clear, get: (name) => entries.get(name)?.peer };
}
