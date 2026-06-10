"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { useState } from "react";

interface ConnectionUser {
  userId: string;
  username: string;
  profile: {
    fullName: string | null;
    headline: string | null;
    profileImage: string | null;
  } | null;
}

interface ConnectionItem {
  connectedAt: string;
  user: ConnectionUser;
}

interface PendingRequest {
  reqId: string;
  fromUser: string;
  createdAt: string;
  from: ConnectionUser;
}

export default function ConnectionsPage() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"active" | "pending">("active");

  // Fetch active connections
  const { data: connections = [], isLoading: loadingConns } = useQuery<ConnectionItem[]>({
    queryKey: ["connections"],
    queryFn: () => apiRequest<ConnectionItem[]>("/api/connections", { token: accessToken }),
    enabled: !!accessToken,
  });

  // Fetch pending requests
  const { data: pendingRequests = [], isLoading: loadingPending } = useQuery<PendingRequest[]>({
    queryKey: ["connections-pending"],
    queryFn: () => apiRequest<PendingRequest[]>("/api/connections/pending", { token: accessToken }),
    enabled: !!accessToken,
  });

  // Accept/Decline request mutation
  const respondMutation = useMutation({
    mutationFn: ({ reqId, action }: { reqId: string; action: "accept" | "decline" }) =>
      apiRequest(`/api/connections/request/${reqId}`, {
        method: "PATCH",
        body: { action },
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["connections-pending"] });
    },
  });

  // Remove connection mutation
  const removeMutation = useMutation({
    mutationFn: (targetUserId: string) =>
      apiRequest(`/api/connections/${targetUserId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">My Network</h1>
        <p className="text-sm text-slate-500">
          Build mutual connections with campus alumni, peers, and faculty members to direct message them.
        </p>

        {/* Tab switcher */}
        <div className="mt-6 flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab("active")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all px-4 ${
              activeTab === "active"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Connections ({connections.length})
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all px-4 flex items-center gap-1.5 ${
              activeTab === "pending"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Pending Requests
            {pendingRequests.length > 0 && (
              <span className="bg-brand-100 text-brand-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main List */}
      <div>
        {activeTab === "active" ? (
          loadingConns ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div key={n} className="h-20 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
              ))}
            </div>
          ) : connections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
              <h3 className="text-sm font-semibold text-slate-800">No connections yet</h3>
              <p className="text-xs text-slate-500 mt-1">
                You can find campus peers and send connection requests by visiting the{" "}
                <Link href="/search" className="text-brand-600 font-bold hover:underline">
                  Search page
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connections.map(({ user, connectedAt }) => (
                <div
                  key={user.userId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all flex items-start justify-between gap-4"
                >
                  <div className="flex gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-bold uppercase text-base border border-brand-100 shrink-0">
                      {user.username.substring(0, 2)}
                    </div>
                    <div className="space-y-1">
                      <Link href={`/profile/${user.userId}`} className="font-bold text-slate-900 hover:text-brand-600 text-sm block">
                        {user.profile?.fullName ?? `@${user.username}`}
                      </Link>
                      <p className="text-xs text-slate-500 line-clamp-1">{user.profile?.headline || "Alumni Connect member"}</p>
                      <p className="text-[10px] text-slate-400">
                        Connected {new Date(connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      href={`/messages?userId=${user.userId}`}
                      className="inline-flex items-center justify-center rounded-lg bg-brand-50 hover:bg-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-all text-center"
                    >
                      Message
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to remove this connection?")) {
                          removeMutation.mutate(user.userId);
                        }
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : loadingPending ? (
          <div className="space-y-4">
            {[1].map((n) => (
              <div key={n} className="h-20 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
            ))}
          </div>
        ) : pendingRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
            <h3 className="text-sm font-semibold text-slate-800">No pending requests</h3>
            <p className="text-xs text-slate-500 mt-1">
              You will be notified when another user requests to connect.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((req) => (
              <div
                key={req.reqId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4"
              >
                <div className="flex gap-3 items-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-bold uppercase text-base border border-brand-100 shrink-0">
                    {req.from.username.substring(0, 2)}
                  </div>
                  <div>
                    <Link href={`/profile/${req.from.userId}`} className="font-bold text-slate-900 hover:text-brand-600 text-sm block">
                      {req.from.profile?.fullName ?? `@${req.from.username}`}
                    </Link>
                    <p className="text-xs text-slate-500 line-clamp-1">{req.from.profile?.headline || "Alumni Connect member"}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Received {new Date(req.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ reqId: req.reqId, action: "accept" })}
                    disabled={respondMutation.isPending}
                    className="inline-flex items-center rounded-lg bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ reqId: req.reqId, action: "decline" })}
                    disabled={respondMutation.isPending}
                    className="inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
