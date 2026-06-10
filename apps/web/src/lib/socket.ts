import { io, Socket } from "socket.io-client";
import { API_BASE } from "./api-client";
import { useAuthStore } from "@/store/auth";

export const socket: Socket = io(API_BASE, {
  autoConnect: false,
  auth: (cb: (data: { token: string | null }) => void) => {
    const token = useAuthStore.getState().accessToken;
    cb({ token });
  },
});