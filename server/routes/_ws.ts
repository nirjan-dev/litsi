import { admitTurnSession, revokeTurnSession } from "../utils/turnSessions";

type MediaState = { audio: boolean; video: boolean; screenStreamID: string | null };
type Peer = Parameters<
  NonNullable<Parameters<typeof defineWebSocketHandler>[0]["open"]>
>[0] & { username?: string; roomID?: string; mediaState?: MediaState };
type MeetingRoom = Map<string, Peer>;
const rooms = new Map<string, MeetingRoom>();

function membership(peer: Peer) {
  if (!peer.roomID || !peer.username) return;
  const room = rooms.get(peer.roomID);
  return room?.get(peer.username) === peer ? room : undefined;
}

function broadcast(room: MeetingRoom, event: object) {
  for (const member of room.values()) member.send(event);
}

function sendUsers(room: MeetingRoom) {
  broadcast(room, {
    type: "usersListUpdate",
    payload: {
      usersList: Array.from(room.keys()),
      mediaStates: Array.from(room, ([username, peer]) => ({ username, ...peer.mediaState! })),
    },
  });
}

function removePeer(peer: Peer) {
  revokeTurnSession(peer);
  const room = membership(peer);
  if (!room) return;
  const roomID = peer.roomID!;
  room.delete(peer.username!);
  peer.unsubscribe(roomID);
  if (room.size === 0) {
    rooms.delete(roomID);
  } else {
    sendUsers(room);
  }
}

function reject(peer: Peer, code: "name_taken" | "invalid_room" | "invalid_name", message: string) {
  peer.send({ type: "roomError", payload: { code, message } });
  peer.close(1008, message);
}


export default defineWebSocketHandler({
  open(peer: Peer) {
    let url: URL;
    try {
      url = new URL(peer.request?.url || "");
    } catch {
      reject(peer, "invalid_room", "A valid room ID is required.");
      return;
    }
    const roomID = url.searchParams.get("roomID");
    const username = (url.searchParams.get("username") ?? "").trim();
    if (!roomID || !/^[A-Za-z0-9_-]{1,100}$/.test(roomID)) {
      reject(peer, "invalid_room", "Room IDs must contain 1–100 letters, numbers, hyphens or underscores.");
      return;
    }
    if (!username || username.length > 40) {
      reject(peer, "invalid_name", "Display names must contain 1–40 characters.");
      return;
    }
    let room = rooms.get(roomID);
    if (room?.has(username)) {
      reject(peer, "name_taken", "That name is already in this room. Choose another name.");
      return;
    }

    // Admission happens only after validation and the live-name uniqueness check.
    const session = admitTurnSession(peer, roomID);
    if (!room) {
      room = new Map();
      rooms.set(roomID, room);
    }
    peer.username = username;
    peer.roomID = roomID;
    peer.mediaState = { audio: false, video: false, screenStreamID: null };
    room.set(username, peer);
    peer.send({ type: "sessionAdmitted", payload: session });
    peer.subscribe(roomID);
    sendUsers(room);
    for (const member of room.values()) {
      if (member !== peer) member.send({ type: "newCallerJoined", payload: { username } });
    }
  },
  message(peer: Peer, message) {
    // Both sender identity and room membership come from admission, never the payload.
    const room = membership(peer);
    if (!room) return;
    let parsed: unknown;
    try {
      const text = message.text();
      if (text === "ping") {
        peer.send("pong");
        return;
      }
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      !("payload" in parsed) || !("type" in parsed)
    ) return;
    const payload = parsed.payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
    const username = peer.username!;
    switch (parsed.type) {
      case "signal":
        if (
          !("username" in payload) || typeof payload.username !== "string" ||
          !("signal" in payload) || typeof payload.signal !== "object" ||
          payload.signal === null || Array.isArray(payload.signal)
        ) return;
        room.get(payload.username)?.send({
          type: "signal",
          payload: { username, signal: payload.signal },
        });
        return;
      case "newCallerReceived":
        if (!("username" in payload) || typeof payload.username !== "string") return;
        room.get(payload.username)?.send({ type: "newCallerReceived", payload: { username } });
        return;
      case "message":
        if (!("message" in payload) || typeof payload.message !== "string") return;
        broadcast(room, { type: "message", payload: { username, message: payload.message } });
        return;
      case "mediaState":
        if (
          !("audio" in payload) || typeof payload.audio !== "boolean" ||
          !("video" in payload) || typeof payload.video !== "boolean" ||
          !("screenStreamID" in payload) ||
          !(payload.screenStreamID === null || typeof payload.screenStreamID === "string")
        ) return;
        peer.mediaState = {
          audio: payload.audio,
          video: payload.video,
          screenStreamID: payload.screenStreamID,
        };
        broadcast(room, { type: "mediaState", payload: { username, ...peer.mediaState } });
        return;
    }
  },
  close(peer: Peer) {
    removePeer(peer);
  },
  error(peer: Peer) {
    removePeer(peer);
  },
});
