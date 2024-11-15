export default defineWebSocketHandler({
  open(peer) {
    console.log("WebSocket connected");
    peer.send({
      user: "server",
      message: "Hello from the server! " + peer,
    });

    peer.publish("chat", {
      user: "server",
      message: `${peer} joined the chat`,
    });

    peer.subscribe("chat");
  },
  close(peer) {
    console.log("WebSocket disconnected");
    peer.publish("chat", {
      user: "server",
      message: `${peer} left the chat`,
    });
  },
  message(peer, message) {
    const msg = {
      user: peer.toString(),
      message: message.toString(),
    };
    peer.send(msg); // echo
    peer.publish("chat", msg);
  },
});
