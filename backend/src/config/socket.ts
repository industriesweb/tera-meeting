import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "./env";

let io: Server;

export function createSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    socket.on("disconnect", () => console.log(`Socket disconnected: ${socket.id}`));
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket server not initialized");
  return io;
}
