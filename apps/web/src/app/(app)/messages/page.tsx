"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";
import { socket } from "@/lib/socket";

interface Member {
  userId: string;
  role: string;
  user: {
    username: string;
    profile?: {
      fullName: string | null;
      profileImage: string | null;
    } | null;
  };
}

interface Conversation {
  convId: string;
  isGroup: boolean;
  createdAt: string;
  members: Member[];
  latestMessage: {
    msgId: string;
    body: string;
    sentAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

interface Message {
  msgId: string;
  convId: string;
  senderId: string;
  body: string;
  sentAt: string;
  sender: {
    userId: string;
    username: string;
    profile?: {
      fullName: string | null;
      profileImage: string | null;
    } | null;
  };
}

export default function MessagesPage() {
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadContainerRef = useRef<HTMLDivElement>(null);

  // Connect socket on mount
  useEffect(() => {
    if (accessToken) {
      socket.auth = (cb: any) => cb({ token: accessToken });
      socket.connect();
    }
    
    // Listen for new messages globally
    const handleNewMessage = (msg: Message) => {
      // Append to active message thread if matching selected conversation
      if (selectedConvId && msg.convId === selectedConvId) {
        setMessages((prev) => {
          // Prevent duplicates
          if (prev.some((m) => m.msgId === msg.msgId)) return prev;
          return [...prev, msg];
        });
        
        // Auto scroll to bottom
        setTimeout(scrollToBottom, 50);
        
        // Mark as read immediately if window is focused
        markAsReadMutation.mutate({ convId: selectedConvId, messageId: msg.msgId });
      }

      // Update conversations list latest message preview and count
      setConversations((prev) =>
        prev.map((c) => {
          if (c.convId === msg.convId) {
            const isSelf = msg.senderId === user?.userId;
            return {
              ...c,
              latestMessage: {
                msgId: msg.msgId,
                body: msg.body,
                sentAt: msg.sentAt,
                senderId: msg.senderId,
              },
              unreadCount: isSelf ? c.unreadCount : c.unreadCount + 1,
            };
          }
          return c;
        })
      );
    };

    const handlePresenceOnline = ({ userId }: { userId: string }) => {
      setPresenceMap((prev) => ({ ...prev, [userId]: true }));
    };

    const handlePresenceOffline = ({ userId }: { userId: string }) => {
      setPresenceMap((prev) => ({ ...prev, [userId]: false }));
    };

    socket.on("new_message", handleNewMessage);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.disconnect();
    };
  }, [accessToken, selectedConvId, user?.userId]);

  // Fetch initial presence statuses
  useEffect(() => {
    if (!accessToken || conversations.length === 0 || !user?.userId) return;

    const recipientIds = conversations
      .map((c) => c.members.find((m) => m.userId !== user.userId)?.userId)
      .filter((id): id is string => !!id);

    if (recipientIds.length > 0) {
      apiRequest<{ data: Record<string, boolean> }>(`/api/presence?userIds=${recipientIds.join(",")}`, {
        token: accessToken,
      })
        .then((res: any) => {
          setPresenceMap((prev) => ({ ...prev, ...res.data }));
        })
        .catch((err) => console.error("Failed to load user presence", err));
    }
  }, [conversations, accessToken, user?.userId]);

  // Load conversations
  const { data: convsData } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: () => apiRequest<Conversation[]>("/api/conversations", { token: accessToken }),
    enabled: !!accessToken,
  });

  useEffect(() => {
    if (convsData) {
      setConversations(convsData);
    }
  }, [convsData]);

  // Load messages for chosen thread (simple fetch wrapper)
  useEffect(() => {
    if (!selectedConvId) return;

    setLoadingMessages(true);
    apiRequest<Message[]>(`/api/conversations/${selectedConvId}/messages?limit=50`, {
      token: accessToken,
    })
      .then((res: Message[]) => {
        setMessages(res || []);
        setTimeout(scrollToBottom, 80);
      })
      .catch((err) => console.error("Failed to load messages", err))
      .finally(() => setLoadingMessages(false));

    // Clear local unread counts
    setConversations((prev) =>
      prev.map((c) => (c.convId === selectedConvId ? { ...c, unreadCount: 0 } : c))
    );
  }, [selectedConvId, accessToken]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest<Message>(`/api/conversations/${selectedConvId}/messages`, {
        method: "POST",
        token: accessToken,
        body: { body },
      }),
    onSuccess: (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.msgId === msg.msgId)) return prev;
        return [...prev, msg];
      });
      setMessageBody("");
      setTimeout(scrollToBottom, 50);

      // Update preview in lists
      setConversations((prev) =>
        prev.map((c) =>
          c.convId === selectedConvId
            ? { ...c, latestMessage: { msgId: msg.msgId, body: msg.body, sentAt: msg.sentAt, senderId: msg.senderId } }
            : c
        )
      );
    },
  });

  // Mark messages read mutation
  const markAsReadMutation = useMutation({
    mutationFn: ({ convId, messageId }: { convId: string; messageId: string }) =>
      apiRequest(`/api/conversations/${convId}/read`, {
        method: "POST",
        token: accessToken,
        body: { messageId },
      }),
  });

  // Trigger mark read when active conversation changes
  useEffect(() => {
    if (!selectedConvId || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (latest && latest.senderId !== user?.userId) {
      markAsReadMutation.mutate({ convId: selectedConvId, messageId: latest.msgId });
    }
  }, [selectedConvId, messages, user?.userId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(messageBody);
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Left panel: Conversation List */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Direct Messages</h2>
          <p className="text-xs text-slate-400 mt-0.5">Chat with your mutual connections</p>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No active chats. Start a chat from a connection's profile.</div>
          ) : (
            conversations.map((conv) => {
              // Find recipient details
              const recipient = conv.members.find((m) => m.userId !== user?.userId);
              const name = recipient?.user.profile?.fullName || recipient?.user.username || "Chat User";
              const initials = (recipient?.user.username || "CU").substring(0, 2);
              const active = selectedConvId === conv.convId;

              return (
                <button
                  key={conv.convId}
                  onClick={() => setSelectedConvId(conv.convId)}
                  className={`w-full text-left p-4 flex items-center gap-3 transition ${
                    active ? "bg-brand-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-bold uppercase text-sm">
                      {initials}
                    </div>
                    {recipient && presenceMap[recipient.userId] && (
                      <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{name}</span>
                      {conv.unreadCount > 0 && (
                        <span className="h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {conv.latestMessage && (
                      <p className="text-xs text-slate-500 truncate">{conv.latestMessage.body}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Active Message Thread */}
      <div className="flex-1 flex flex-col bg-slate-50/20">
        {selectedConvId ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-3 shadow-sm">
              {(() => {
                const activeConv = conversations.find((c) => c.convId === selectedConvId);
                const recipient = activeConv?.members.find((m) => m.userId !== user?.userId);
                const name = recipient?.user.profile?.fullName || recipient?.user.username || "Chat User";
                const initials = (recipient?.user.username || "CU").substring(0, 2);
                return (
                  <>
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-bold uppercase text-xs">
                        {initials}
                      </div>
                      {recipient && presenceMap[recipient.userId] && (
                        <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">{name}</span>
                      <span className="block text-[10px] text-slate-400">
                        {recipient && presenceMap[recipient.userId] ? "Online" : "Offline"}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Messages Area */}
            <div
              ref={threadContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col"
            >
              {loadingMessages ? (
                <div className="text-center py-12 text-slate-400 text-xs animate-pulse">Loading message history...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-24 text-slate-400 text-xs">No messages yet. Send a greeting!</div>
              ) : (
                messages.map((msg) => {
                  const isSelf = msg.senderId === user?.userId;
                  return (
                    <div
                      key={msg.msgId}
                      className={`flex flex-col max-w-[70%] space-y-1 ${
                        isSelf ? "self-end items-end" : "self-start items-start"
                      }`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2 text-sm ${
                          isSelf
                            ? "bg-slate-900 text-white rounded-br-none"
                            : "bg-slate-100 text-slate-900 rounded-bl-none"
                        }`}
                      >
                        {msg.body}
                      </div>
                      <span className="text-[9px] text-slate-400 px-1">
                        {new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Box */}
            <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-white flex gap-3 items-center">
              <input
                type="text"
                placeholder="Type your message here..."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!messageBody.trim() || sendMessageMutation.isPending}
                className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60 transition"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <span>💬</span>
            <span className="text-xs">Select a conversation to start messaging</span>
          </div>
        )}
      </div>
    </div>
  );
}
