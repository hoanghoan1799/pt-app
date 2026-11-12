import type { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";

// Socket.IO on the API's HTTP server. CORS only lets the web origin read the
// handshake; the origin itself is checked in the namespace middleware
// (RealtimeAuth), which also covers clients that ignore CORS.
//
// Single instance: rooms live in this process. Before running two instances,
// add `@socket.io/redis-adapter` here (`server.adapter(createAdapter(pub,
// sub))`) and move TicketStore to Redis; nothing else changes.
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly webOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.webOrigin, methods: ["GET", "POST"] },
    } as ServerOptions);
  }
}
