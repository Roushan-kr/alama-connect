"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import { socket } from "@/lib/socket";

interface NotificationItem {
  notifId: string;
  type: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsPopover() {
  const queryClient = useQueryClient();
  const { accessToken, user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await apiRequest<{ data: NotificationItem[] }>("/api/notifications", {
        token: accessToken,
      });
      return res.data;
    },
    enabled: !!accessToken,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  // Mark single read mutation
  const markReadMutation = useMutation({
    mutationFn: (notifId: string) =>
      apiRequest(`/api/notifications/${notifId}/read`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark all read mutation
  const markAllReadMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/notifications/read-all", {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Real-time socket updates
  useEffect(() => {
    if (!accessToken || !user) return;

    socket.connect();

    const handleNotification = (notif: NotificationItem) => {
      // Prepend to cached query data
      queryClient.setQueryData<NotificationItem[]>(["notifications"], (old = []) => {
        // Prevent duplicates
        if (old.some((n) => n.notifId === notif.notifId)) return old;
        return [notif, ...old];
      });
    };

    socket.on("notification", handleNotification);

    return () => {
      socket.off("notification", handleNotification);
      socket.disconnect();
    };
  }, [accessToken, user, queryClient]);

  // Click outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none"
        aria-label="Notifications"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white py-2 shadow-lg ring-1 ring-black/5 animate-fade-in z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 pb-2 pt-1">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">No notifications yet.</p>
            ) : (
              notifications.slice(0, 20).map((notif) => (
                <div
                  key={notif.notifId}
                  onClick={() => {
                    if (!notif.readAt) {
                      markReadMutation.mutate(notif.notifId);
                    }
                    if (notif.link) {
                      window.location.href = notif.link;
                    }
                  }}
                  className={`flex flex-col border-b border-slate-50 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 ${
                    !notif.readAt ? "bg-brand-50/30 hover:bg-brand-50/50" : ""
                  }`}
                >
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{notif.message}</p>
                  <span className="mt-1 text-[10px] text-slate-400">
                    {new Date(notif.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
