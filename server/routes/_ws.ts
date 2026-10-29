import { admitTurnSession, revokeTurnSession } from "../utils/turnSessions";

type Peer = Parameters<
  NonNullable<Parameters<typeof defineWebSocketHandler>[0]["open"]>
>[0] & { username?: string; roomID?: string };
type MeetingRoom = Map<string, Peer>;
const rooms = new Map<string, MeetingRoom>();

type PeerMessage = {
  type:
    | "message"
    | "signal"
    | "usersListUpdate"
    | "newCallerJoined"
    | "newCallerReceived";
  payload: {
    username: string;
    [key: string]: string;
  };
};

function sendUpdateChatUsersEvent(meetingRoom: MeetingRoom, peer: Peer) {
  peer.publish((peer as Peer).roomID!, {
    type: "usersListUpdate",
    payload: {
      usersList: Array.from(meetingRoom.keys()),
    },
  });
  peer.send({
    type: "usersListUpdate",
    payload: {
      usersList: Array.from(meetingRoom.keys()),
    },
  });
}

function removePeer(peer: Peer) {
  const roomID = peer.roomID;
  const username = peer.username;
  revokeTurnSession(peer);
  if (typeof roomID !== "string" || !roomID || typeof username !== "string" || !username) return;
  const meetingRoom = rooms.get(roomID);
  if (!meetingRoom) return;
  if (meetingRoom.get(username) === peer) meetingRoom.delete(username);
}

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    const room = url.searchParams.get("roomID");
    const session = admitTurnSession(peer, room);
    const admittedRoom = room as string;

    let meetingRoom: MeetingRoom;
    if (!rooms.has(admittedRoom)) {
      meetingRoom = rooms.set(admittedRoom, new Map()).get(admittedRoom)!;
      console.log(`created new meeting room: ${admittedRoom}`);
    } else {
      meetingRoom = rooms.get(admittedRoom)!;
      console.log(`joined existing meeting room: ${admittedRoom}`);
    }

    (peer as Peer).username = username;
    (peer as Peer).roomID = admittedRoom;
    console.log("WebSocket connected for user: ", username);
    peer.send({ type: "sessionAdmitted", payload: session });
    peer.subscribe(admittedRoom);
    meetingRoom?.set(username, peer);

    sendUpdateChatUsersEvent(meetingRoom, peer);

    peer.publish(admittedRoom, {
      type: "newCallerJoined",
      payload: {
        username,
      },
    });
  },
  message(peer, message) {
    if (typeof message === "string" && message === "ping") {
      peer.send("pong");
      return;
    }

    // TODO: parse message properly
    const messageJson = message.json() as PeerMessage;

    // TODO: add development logging
    // console.log(messageJson);

    const messageSender = (peer as Peer).username;
    const messageReceiver = messageJson.payload.username;
    const roomID = (peer as Peer).roomID ?? "";
    const meetingRoom = rooms.get(roomID)!;
    const messageReceiverPeer = meetingRoom.get(messageReceiver);

    switch (messageJson.type) {
      case "signal":
        // console.log(
        //   `sending signal to ${messageReceiver} from ${messageSender}`
        // );
        messageReceiverPeer?.send({
          type: "signal",
          payload: {
            username: messageSender,
            signal: messageJson.payload.signal,
          },
        });
        return;
      case "newCallerReceived":
        // console.log(
        //   `new caller ${messageReceiver} received from ${messageSender}`
        // );
        messageReceiverPeer?.send({
          type: "newCallerReceived",
          payload: {
            username: messageSender,
          },
        });
        return;
      case "message":
        // console.log(`sending message to chat by ${messageSender}`);
        peer.publish(roomID, {
          type: "message",
          payload: {
            username: messageSender,
            message: messageJson.payload.message,
          },
        });
        peer.send({
          type: "message",
          payload: {
            username: messageSender,
            message: messageJson.payload.message,
          },
        });
        return;
      default:
        console.log("Unknown message type: ", messageJson.type);
        return;
    }
  },
  close(peer) {
    const roomID = (peer as Peer).roomID ?? "";
    const meetingRoom = rooms.get(roomID);
    removePeer(peer as Peer);
    if (meetingRoom) {
      try {
        sendUpdateChatUsersEvent(meetingRoom, peer as Peer);
      } catch {
      }
    }
    console.log("WebSocket closed for user: ", (peer as Peer).username);
  },
  error(peer) {
    removePeer(peer as Peer);
  },
});
