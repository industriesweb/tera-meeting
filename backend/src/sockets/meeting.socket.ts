import { Socket } from "socket.io";
import { getIO } from "../config/socket";

export function registerMeetingHandlers(socket: Socket) {
  socket.on("meeting:join", (meetingId: string) => {
    socket.join(`meeting:${meetingId}`);
  });

  socket.on("meeting:leave", (meetingId: string) => {
    socket.leave(`meeting:${meetingId}`);
  });
}

export function notifyMeetingUpdate(meetingId: string, event: string, data: unknown) {
  try {
    getIO().to(`meeting:${meetingId}`).emit(event, data);
  } catch {
    // Socket.IO not initialized (e.g. during tests)
  }
}
