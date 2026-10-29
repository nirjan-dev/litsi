import { randomBytes } from "node:crypto";

const SESSION_TTL_MS = 3600_000;
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT = 12;
const PROVIDER_WINDOW_MS = 3600_000;
const PROVIDER_LIMIT = 60;
const PROVIDER_COOLDOWN_MS = 30_000;
const CACHE_MARGIN_MS = 60_000;

export interface TurnCredentials {
  iceServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  expiresAt: number;
}

export interface TurnSession {
  capability: string;
  roomID: string;
  expiresAt: number;
  revoked: boolean;
  requests: number[];
  lastProviderAttempt?: number;
  cached?: TurnCredentials;
  inFlight?: Promise<TurnCredentials>;
}

const sessions = new Map<string, TurnSession>();
const peerSessions = new WeakMap<object, TurnSession>();
const providerAttempts: number[] = [];
let providerCursor = 0;

function unauthorized(): never {
  throw createError({ statusCode: 401, statusMessage: "Live room session required" });
}

function revoke(session: TurnSession) {
  session.revoked = true;
  session.cached = undefined;
  sessions.delete(session.capability);
}

function prune(now: number) {
  for (const session of sessions.values()) {
    if (session.expiresAt <= now) revoke(session);
  }
  while (providerCursor < providerAttempts.length && providerAttempts[providerCursor]! <= now - PROVIDER_WINDOW_MS) {
    providerCursor += 1;
  }
  if (providerCursor > 1024 && providerCursor * 2 > providerAttempts.length) {
    providerAttempts.splice(0, providerCursor);
    providerCursor = 0;
  }
}

function providerUsage(now: number): { active: number; oldest: number } {
  prune(now);
  return {
    active: providerAttempts.length - providerCursor,
    oldest: providerAttempts[providerCursor] ?? now - PROVIDER_WINDOW_MS,
  };
}

function assertLive(session: TurnSession, now = Date.now()) {
  if (session.revoked || session.expiresAt <= now || sessions.get(session.capability) !== session) {
    revoke(session);
    unauthorized();
  }
}

export function admitTurnSession(peer: object, roomID: unknown) {
  if (typeof roomID !== "string" || !roomID.trim()) {
    throw createError({ statusCode: 400, statusMessage: "Room is required" });
  }
  const now = Date.now();
  prune(now);
  revokeTurnSession(peer);
  const session: TurnSession = {
    capability: randomBytes(32).toString("base64url"),
    roomID,
    expiresAt: now + SESSION_TTL_MS,
    revoked: false,
    requests: [],
  };
  sessions.set(session.capability, session);
  peerSessions.set(peer, session);
  return { capability: session.capability, expiresAt: session.expiresAt };
}

export function revokeTurnSession(peer: object) {
  const session = peerSessions.get(peer);
  if (session) revoke(session);
  peerSessions.delete(peer);
}

export function requireTurnSession(capability: unknown, roomID: unknown) {
  const now = Date.now();
  prune(now);
  const session = typeof capability === "string" ? sessions.get(capability) : undefined;
  if (!session || typeof roomID !== "string" || !roomID || session.roomID !== roomID) unauthorized();
  assertLive(session, now);
  return session;
}

function rateLimited(retryAfterMs: number): never {
  throw createError({
    statusCode: 429,
    statusMessage: "TURN issuance limit reached",
    data: { retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) },
  });
}

export type ProviderFetch = (url: string, options: {
  method: "POST";
  headers: Record<string, string>;
  body: { ttl: number };
  retry: number;
  timeout: number;
}) => Promise<unknown>;

function parseIceServers(value: unknown): TurnCredentials["iceServers"] {
  const servers = typeof value === "object" && value !== null && "iceServers" in value ? value.iceServers : undefined;
  if (!Array.isArray(servers) || !servers.length) throw new Error("Invalid ICE servers");
  return servers.map((server: unknown) => {
    if (typeof server !== "object" || server === null || !("urls" in server)) throw new Error("Invalid ICE server");
    const urls = server.urls;
    const usernameValue = "username" in server ? server.username : undefined;
    const credentialValue = "credential" in server ? server.credential : undefined;
    if (!Array.isArray(urls) || !urls.length) throw new Error("Invalid ICE server");
    const urlList: string[] = [];
    for (const url of urls) {
      if (typeof url !== "string" || !url) throw new Error("Invalid ICE server");
      urlList.push(url);
    }
    if (usernameValue !== undefined && typeof usernameValue !== "string") throw new Error("Invalid ICE server");
    if (credentialValue !== undefined && typeof credentialValue !== "string") throw new Error("Invalid ICE server");
    return {
      urls: urlList,
      ...(typeof usernameValue === "string" ? { username: usernameValue } : {}),
      ...(typeof credentialValue === "string" ? { credential: credentialValue } : {}),
    };
  });
}

export async function issueTurnCredentials(
  session: TurnSession,
  config: { turnID?: unknown; turnToken?: unknown },
  fetchProvider: ProviderFetch,
): Promise<TurnCredentials> {
  const now = Date.now();
  assertLive(session, now);
  session.requests = session.requests.filter((time) => time > now - REQUEST_WINDOW_MS);
  if (session.requests.length >= REQUEST_LIMIT) {
    rateLimited(session.requests[0]! + REQUEST_WINDOW_MS - now);
  }
  session.requests.push(now);

  if (session.cached && session.cached.expiresAt - CACHE_MARGIN_MS > now) {
    return session.cached;
  }
  const turnID = config.turnID;
  const turnToken = config.turnToken;
  if (typeof turnID !== "string" || !turnID || typeof turnToken !== "string" || !turnToken) {
    throw createError({ statusCode: 503, statusMessage: "TURN service unavailable" });
  }
  if (!session.inFlight) {
    const usage = providerUsage(now);
    if (session.lastProviderAttempt !== undefined && now - session.lastProviderAttempt < PROVIDER_COOLDOWN_MS) {
      rateLimited(session.lastProviderAttempt + PROVIDER_COOLDOWN_MS - now);
    }
    if (usage.active >= PROVIDER_LIMIT) {
      rateLimited(usage.oldest + PROVIDER_WINDOW_MS - now);
    }
    session.lastProviderAttempt = now;
    providerAttempts.push(now);
    const inFlight = (async () => {
      let credentials: TurnCredentials;
      try {
        const response = await fetchProvider(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnID)}/credentials/generate-ice-servers`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${turnToken}`, "Content-Type": "application/json" },
            body: { ttl: 3600 },
            retry: 0,
            timeout: 10_000,
          },
        );
        credentials = { iceServers: parseIceServers(response), expiresAt: now + SESSION_TTL_MS };
      } catch {
        assertLive(session);
        throw createError({ statusCode: 502, statusMessage: "TURN provider unavailable" });
      }
      assertLive(session);
      session.cached = credentials;
      return credentials;
    })();
    session.inFlight = inFlight;
    try {
      return await inFlight;
    } finally {
      if (session.inFlight === inFlight) session.inFlight = undefined;
    }
  }
  const credentials = await session.inFlight;
  assertLive(session);
  return credentials;
}
