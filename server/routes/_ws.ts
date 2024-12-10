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

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    const room = url.searchParams.get("roomID");
    if (!room) {
      throw createError({
        statusCode: 400,
        statusMessage: "Room is required",
      });
    }
    // TODO: add validation for existing username and don't allow empty usernames

    let meetingRoom: MeetingRoom;
    if (!rooms.has(room)) {
      meetingRoom = rooms.set(room, new Map()).get(room)!;
      console.log(`created new meeting room: ${room}`);
    } else {
      meetingRoom = rooms.get(room)!;
      console.log(`joined existing meeting room: ${room}`);
    }

    (peer as Peer).username = username;
    (peer as Peer).roomID = room;
    console.log("WebSocket connected for user: ", username);
    peer.subscribe(room);
    meetingRoom?.set(username, peer);

    sendUpdateChatUsersEvent(meetingRoom, peer);

    peer.publish(room, {
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
    console.log(messageJson);
    const messageSender = (peer as Peer).username;
    const messageReceiver = messageJson.payload.username;
    const meetingRoom = rooms.get((peer as Peer).roomID ?? "")!;
    const messageReceiverPeer = meetingRoom.get(messageReceiver);

    switch (messageJson.type) {
      case "signal":
        console.log(
          `sending signal to ${messageReceiver} from ${messageSender}`
        );
        messageReceiverPeer?.send({
          type: "signal",
          payload: {
            username: messageSender,
            signal: messageJson.payload.signal,
          },
        });
        return;
      case "newCallerReceived":
        console.log(
          `new caller ${messageReceiver} received from ${messageSender}`
        );
        messageReceiverPeer?.send({
          type: "newCallerReceived",
          payload: {
            username: messageSender,
          },
        });
        return;
      case "message":
        console.log(`sending message to chat by ${messageSender}`);
        peer.publish("chat", {
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
    const meetingRoom = rooms.get((peer as Peer).roomID ?? "")!;
    meetingRoom.delete((peer as Peer).username!);

    sendUpdateChatUsersEvent(meetingRoom, peer);

    console.log("WebSocket closed for user: ", (peer as any).username);
  },
});
