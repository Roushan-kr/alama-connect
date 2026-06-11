"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { useState, useEffect } from "react";

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
  const [activeTab, setActiveTab] = useState<"active" | "pending" | "discover">("active");

  // Search and Network Filter State for Discovery
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Debounce Search input (400ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQ(q);
    }, 400);
    return () => clearTimeout(handler);
  }, [q]);

  // Load user profile & networks to populate network selector
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  });

  const verifiedMemberships = profile?.networkMemberships?.filter((m: any) => m.status === "VERIFIED") || [];

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

  // Fetch discoverable peers with infinite scroll (keyset cursor pagination)
  const {
    data: discoverPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingDiscover,
  } = useInfiniteQuery({
    queryKey: ["discover-peers", selectedNetworkId, debouncedQ],
    queryFn: ({ pageParam }) => {
      let url = `/api/connections/discover?limit=10`;
      if (selectedNetworkId) {
        url += `&networkId=${selectedNetworkId}`;
      }
      if (debouncedQ) {
        url += `&q=${encodeURIComponent(debouncedQ)}`;
      }
      if (pageParam) {
        url += `&cursor=${pageParam}`;
      }
      return apiRequest<any>(url, { token: accessToken });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!accessToken && activeTab === "discover",
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

  // Toggle Follow Mutation with Optimistic Updates
  const toggleFollowMutation = useMutation({
    mutationFn: ({ userId, isFollowing }: { userId: string; isFollowing: boolean }) =>
      apiRequest(`/api/follow/${userId}`, {
        method: isFollowing ? "DELETE" : "POST",
        token: accessToken,
      }),
    onMutate: async ({ userId, isFollowing }) => {
      // Cancel discover queries
      await queryClient.cancelQueries({ queryKey: ["discover-peers"] });

      const previousDiscover = queryClient.getQueryData(["discover-peers", selectedNetworkId, debouncedQ]);

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: ["discover-peers"] },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              data: page.data.map((peer: any) => {
                if (peer.userId === userId) {
                  return { ...peer, isFollowing: !isFollowing };
                }
                return peer;
              }),
            })),
          };
        }
      );

      return { previousDiscover };
    },
    onError: (err, variables, context) => {
      if (context?.previousDiscover) {
        queryClient.setQueryData(["discover-peers", selectedNetworkId, debouncedQ], context.previousDiscover);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["discover-peers"] });
    },
  });

  // Connect Mutation with Optimistic updates & Rate Limit display
  const connectMutation = useMutation({
    mutationFn: (toUserId: string) =>
      apiRequest(`/api/connections/request`, {
        method: "POST",
        body: { toUserId },
        token: accessToken,
      }),
    onMutate: async (toUserId) => {
      setErrorMsg(null);
      await queryClient.cancelQueries({ queryKey: ["discover-peers"] });

      const previousDiscover = queryClient.getQueryData(["discover-peers", selectedNetworkId, debouncedQ]);

      // Optimistically hide the card of the user we connected with
      queryClient.setQueriesData(
        { queryKey: ["discover-peers"] },
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              data: page.data.filter((peer: any) => peer.userId !== toUserId),
            })),
          };
        }
      );

      return { previousDiscover };
    },
    onError: (err: any, toUserId, context) => {
      if (context?.previousDiscover) {
        queryClient.setQueryData(["discover-peers", selectedNetworkId, debouncedQ], context.previousDiscover);
      }
      setErrorMsg(err?.error || err?.message || "Failed to send connection request.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["discover-peers"] });
      queryClient.invalidateQueries({ queryKey: ["connections-pending"] });
    },
  });

  const allDiscoverPeers = discoverPages?.pages.flatMap((page) => page.data) || [];

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">My Network</h1>
        <p className="text-sm text-slate-500">
          Build mutual connections and discover peers within your institutional networks to follow and message.
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
          <button
            onClick={() => setActiveTab("discover")}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all px-4 ${
              activeTab === "discover"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Discover Peers
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
                You can discover campus peers and send connection requests by visiting the{" "}
                <button onClick={() => setActiveTab("discover")} className="text-brand-600 font-bold hover:underline">
                  Discover Peers
                </button>{" "}
                tab.
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
        ) : activeTab === "pending" ? (
          loadingPending ? (
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
          )
        ) : (
          // Active tab is Discover
          <div className="space-y-6">
            {/* Rate limit / Error Alert */}
            {errorMsg && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs font-medium text-red-600 shadow-sm transition-all duration-300">
                {errorMsg}
              </div>
            )}

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search by name, branch, batch, or headline..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-10 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all text-slate-850 placeholder-slate-400"
                />
              </div>
              {verifiedMemberships.length > 0 && (
                <select
                  value={selectedNetworkId || ""}
                  onChange={(e) => setSelectedNetworkId(e.target.value || undefined)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 transition-all text-slate-700 shrink-0 min-w-[180px]"
                >
                  <option value="">All Networks</option>
                  {verifiedMemberships.map((m: any) => (
                    <option key={m.networkId} value={m.networkId}>
                      {m.network.code} ({m.network.name})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Discover Peers list */}
            {verifiedMemberships.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
                <h3 className="text-sm font-semibold text-slate-800">No verified networks</h3>
                <p className="text-xs text-slate-500 mt-1">
                  You need to be verified in a campus network to discover peers.
                </p>
              </div>
            ) : loadingDiscover ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-44 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
                ))}
              </div>
            ) : allDiscoverPeers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
                <h3 className="text-sm font-semibold text-slate-800">No discoverable peers</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {debouncedQ
                    ? "Try adjusting your search terms."
                    : "You are already connected or have pending requests with all verified members."}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allDiscoverPeers.map((peer: any) => (
                    <div
                      key={peer.userId}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="flex gap-3 items-start">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-bold uppercase text-base border border-brand-100 shrink-0">
                          {peer.username.substring(0, 2)}
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/profile/${peer.userId}`}
                              className="font-bold text-slate-900 hover:text-brand-600 text-sm block truncate max-w-[180px]"
                            >
                              {peer.profile?.fullName ?? `@${peer.username}`}
                            </Link>
                            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">
                              {peer.role}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1">{peer.profile?.headline || "Alumni Connect member"}</p>

                          {peer.education && (
                            <p className="text-xs text-slate-600 font-medium">
                              {peer.education.degree ? `${peer.education.degree} in ` : ""}
                              {peer.education.field || "General Studies"}
                              {peer.education.endYear ? ` (${peer.education.endYear})` : ""}
                            </p>
                          )}

                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[9px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded font-semibold border border-brand-100 uppercase tracking-wider">
                              {peer.networkCode}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[150px]" title={peer.networkName}>
                              {peer.networkName}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full mt-2">
                        <button
                          onClick={() =>
                            toggleFollowMutation.mutate({
                              userId: peer.userId,
                              isFollowing: peer.isFollowing,
                            })
                          }
                          disabled={toggleFollowMutation.isPending}
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all border text-center cursor-pointer ${
                            peer.isFollowing
                              ? "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              : "bg-white border-brand-200 text-brand-600 hover:bg-brand-50/50"
                          }`}
                        >
                          {peer.isFollowing ? "Following" : "Follow"}
                        </button>
                        <button
                          onClick={() => connectMutation.mutate(peer.userId)}
                          disabled={connectMutation.isPending}
                          className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 py-2 text-xs font-semibold text-white transition-all text-center cursor-pointer disabled:opacity-50"
                        >
                          Connect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {hasNextPage && (
                  <div className="flex justify-center mt-6">
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {isFetchingNextPage ? "Loading more..." : "Load More"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
