import { Server } from "socket.io";
import { registerMeetingHandlers } from "./meeting.socket";

export function registerSockets(io: Server) {
  io.on("connection", (socket) => {
    registerMeetingHandlers(socket);
  });
}
