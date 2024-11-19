const connectedUsers = new Set();

export default defineWebSocketHandler({
  open(peer) {
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    (peer as any).username = username;

    console.log("WebSocket connected for user: ", username);

    peer.publish("chat", {
      user: "server",
      message: `${username} joined the chat`,
    });

    peer.subscribe("chat");

    connectedUsers.add(username);

    peer.publish("chat", {
      action: "usersListUpdate",
      usersList: Array.from(connectedUsers),
    });
    peer.send({
      action: "usersListUpdate",
      usersList: Array.from(connectedUsers),
    });
  },
  message(peer, message) {
    if (typeof message === "string" && message === "ping") {
      peer.send("pong");
      return;
    }

    const msg = {
      user: (peer as any).username,
      message: message.toString(),
    };
    peer.send(msg); // echo
    console.log(`sending message to chat by ${(peer as any).username}`);
    peer.publish("chat", msg);
  },
  close(peer) {
    peer.publish("chat", {
      user: "server",
      message: `${(peer as any).username} left!`,
    });

    connectedUsers.delete((peer as any).username);

    peer.publish("chat", {
      action: "usersListUpdate",
      usersList: Array.from(connectedUsers),
    });

    console.log("WebSocket closed for user: ", (peer as any).username);
  },
});
