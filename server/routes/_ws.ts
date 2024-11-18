const connectedUsers = new Set();

export default defineWebSocketHandler({
  open(peer) {
    console.log("WebSocket connected");
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    (peer as any).username = username;

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
    const msg = {
      user: (peer as any).username,
      message: message.toString(),
    };
    peer.send(msg); // echo
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
  },
});
