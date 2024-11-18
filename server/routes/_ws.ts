export default defineWebSocketHandler({
  open(peer) {
    console.log("WebSocket connected");
    const url = new URL(peer.request?.url || "");
    const username = url.searchParams.get("username") ?? "anonymous";
    (peer as any).username = username;

    peer.send({ user: "server", message: `Welcome ${username}!` });

    peer.publish("chat", {
      user: "server",
      message: `${username} joined the chat`,
    });

    peer.subscribe("chat");
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
  },
});
