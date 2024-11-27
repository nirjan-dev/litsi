type Peer = Parameters<
  NonNullable<Parameters<typeof defineWebSocketHandler>[0]["open"]>
>[0];
const connectedUsers = new Map<string, Peer>();

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

function sendUpdateChatUsersEvent(peer: Peer) {
  peer.publish("chat", {
    type: "usersListUpdate",
    payload: {
      usersList: Array.from(connectedUsers.keys()),
    },
  });
  peer.send({
    type: "usersListUpdate",
    payload: {
      usersList: Array.from(connectedUsers.keys()),
    },
  });
}

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    (peer as any).username = username;

    console.log("WebSocket connected for user: ", username);

    peer.subscribe("chat");

    connectedUsers.set(username, peer);

    sendUpdateChatUsersEvent(peer);

    peer.publish("chat", {
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
    const messageSender = (peer as any).username;
    const messageReceiver = messageJson.payload.username;
    const messageReceiverPeer = connectedUsers.get(messageReceiver);

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
    connectedUsers.delete((peer as any).username);

    sendUpdateChatUsersEvent(peer);

    console.log("WebSocket closed for user: ", (peer as any).username);
  },
});
