import type { Client, Notification } from "pg";

// A stream owns one dedicated LISTEN connection; never use transaction pooling here.
export function ownershipStream(client: Client, signal: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;
  let close: () => void = () => {};
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    signal.removeEventListener("abort", close);
    client.removeListener("notification", onNotification);
    client.removeListener("end", close);
    // Keep the error listener until end() settles, to absorb shutdown errors.
    void client.end().catch(() => {}).finally(() => client.removeListener("error", close));
  };
  let send: (event: string) => void = () => {};
  const onNotification = (notification: Notification) => {
    if (notification.channel === "ownership_updated") send("ownership-updated");
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      close = () => {
        if (closed) return;
        cleanup();
        controller.close();
      };
      send = event => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: {}\n\n`));
      };
      client.on("notification", onNotification);
      client.on("error", close);
      client.on("end", close);
      signal.addEventListener("abort", close, { once: true });
      if (signal.aborted) { close(); return; }
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      // Reload after every successful (re)connection to recover missed notifications.
      send("ready");
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 15000);
      // Reconnect through the authenticated route periodically; no indefinite session.
      lifetime = setTimeout(close, 55000);
    },
    cancel() { cleanup(); },
  });
}
