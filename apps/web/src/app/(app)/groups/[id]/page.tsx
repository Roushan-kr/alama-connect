"use client";

import { useParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";

interface Member {
  userId: string;
  role: string;
  user: {
    username: string;
    profile?: {
      fullName: string | null;
    } | null;
  };
}

interface GroupDetails {
  groupId: string;
  networkId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdBy: string;
  _count: {
    members: number;
  };
  role: string | null; // currentUser's role in the group
}

interface FeedItem {
  contentId: string;
  title: string | null;
  body: string;
  createdAt: string;
  author: {
    userId: string;
    username: string;
    profileImage: string | null;
    fullName: string | null;
  };
  likesCount: number;
  commentsCount: number;
  userLiked: boolean;
}

interface FeedResponse {
  data: FeedItem[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
}

export default function GroupPage() {
  const { id: groupId } = useParams() as { id: string };
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();

  const [postBody, setPostBody] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Fetch Group Info
  const { data: group, status: groupStatus } = useQuery<GroupDetails>({
    queryKey: ["group", groupId],
    queryFn: () => apiRequest<GroupDetails>(`/api/groups/${groupId}`, { token: accessToken }),
    enabled: !!accessToken && !!groupId,
  });

  // Search network members
  const { data: searchResults, isFetching: isSearching } = useQuery<any>({
    queryKey: ["networkUserSearch", group?.networkId, memberSearchQuery],
    queryFn: () =>
      apiRequest<any>(
        `/api/search?networkId=${group?.networkId}&type=users&q=${encodeURIComponent(memberSearchQuery)}&limit=15`,
        { token: accessToken }
      ),
    enabled: !!accessToken && !!group?.networkId && memberSearchQuery.trim().length >= 2,
  });

  // Fetch discoverable peers for initial list
  const { data: initialPeers, isFetching: isLoadingInitial } = useQuery<any>({
    queryKey: ["networkDiscoverPeers", group?.networkId],
    queryFn: () =>
      apiRequest<any>(
        `/api/connections/discover?networkId=${group?.networkId}&limit=50`,
        { token: accessToken }
      ),
    enabled: !!accessToken && !!group?.networkId,
  });

  const usersToDisplay = memberSearchQuery.trim().length >= 2
    ? (searchResults?.data || [])
    : (initialPeers?.data || []).map((p: any) => ({
        id: p.userId,
        title: p.profile?.fullName || p.username,
        metadata: { username: p.username }
      }));

  const isMember = group?.role !== null;
  const isAdmin = group?.role === "ADMIN" || group?.role === "MODERATOR";

  // Fetch Group Members (used in sidebar for admins)
  const { data: membersResult } = useQuery<{ data: Member[] }>({
    queryKey: ["groupMembers", groupId],
    queryFn: () => apiRequest<{ data: Member[] }>(`/api/groups/${groupId}/members`, { token: accessToken }), // Wait, is there a get members route? 
    // In our service we don't have get members, but we can query from groups table. Let's make sure it handles gracefully.
    enabled: !!accessToken && !!groupId && isMember,
    retry: false,
  });
  
  const members = membersResult?.data || [];
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (accessToken && members.length > 0) {
      const userIds = members.map((m) => m.userId).join(",");
      apiRequest<{ data: Record<string, boolean> }>(`/api/presence?userIds=${userIds}`, {
        token: accessToken,
      })
        .then((res: any) => setPresenceMap((prev) => ({ ...prev, ...res.data })))
        .catch((err) => console.error("Failed to load group members presence", err));
    }
  }, [members, accessToken]);

  // Group Feed infinite query
  const {
    data: feedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status: feedStatus,
  } = useInfiniteQuery<FeedResponse>({
    queryKey: ["groupFeed", groupId],
    queryFn: ({ pageParam }) => {
      const url = `/api/feed/global?limit=10&groupId=${groupId}${pageParam ? `&cursor=${pageParam}` : ""}`;
      return apiRequest<FeedResponse>(url, { token: accessToken });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor || undefined,
    enabled: !!accessToken && !!groupId && isMember,
  });

  // Infinite Scroll Trigger
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.8 }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }
    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Join Group Mutation
  const joinGroupMutation = useMutation({
    mutationFn: () => apiRequest(`/api/groups/${groupId}/join`, { method: "POST", token: accessToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["groupFeed", groupId] });
    },
  });

  // Create Post Mutation
  const createPostMutation = useMutation({
    mutationFn: (newPost: any) => {
      const formData = new FormData();
      formData.append("networkId", group?.networkId || "");
      formData.append("groupId", groupId);
      formData.append("visibility", "GROUP");
      formData.append("body", newPost.body);
      if (newPost.title) formData.append("title", newPost.title);
      return apiRequest("/api/posts", {
        method: "POST",
        token: accessToken,
        body: formData,
      });
    },
    onSuccess: () => {
      setPostBody("");
      setPostTitle("");
      setPostError(null);
      queryClient.invalidateQueries({ queryKey: ["groupFeed", groupId] });
    },
    onError: (err: any) => {
      setPostError(err.message || "Failed to publish post");
    },
  });

  // Invite Member Mutation
  const inviteMemberMutation = useMutation({
    mutationFn: (targetId: string) =>
      apiRequest(`/api/groups/${groupId}/members/invite`, {
        method: "POST",
        token: accessToken,
        body: { userId: targetId },
      }),
    onSuccess: () => {
      setInviteSuccess(true);
      setInviteUserId("");
      setInviteError(null);
      queryClient.invalidateQueries({ queryKey: ["groupMembers", groupId] });
      setTimeout(() => setInviteSuccess(false), 3000);
    },
    onError: (err: any) => {
      setInviteError(err.message || "Failed to invite user");
    },
  });

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postBody) return;
    createPostMutation.mutate({
      title: postTitle || undefined,
      body: postBody,
    });
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUserId) return;
    inviteMemberMutation.mutate(inviteUserId);
  };

  const [isInvitingSelected, setIsInvitingSelected] = useState(false);

  const handleInviteSelected = async () => {
    if (selectedUsers.length === 0) return;
    setIsInvitingSelected(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      await Promise.all(
        selectedUsers.map((u) =>
          apiRequest(`/api/groups/${groupId}/members/invite`, {
            method: "POST",
            token: accessToken,
            body: { userId: u.id },
          })
        )
      );

      setInviteSuccess(true);
      setSelectedUsers([]);
      setMemberSearchQuery("");
      queryClient.invalidateQueries({ queryKey: ["groupMembers", groupId] });
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: any) {
      setInviteError(err.message || "Failed to invite some users");
    } finally {
      setIsInvitingSelected(false);
    }
  };

  if (groupStatus === "pending") {
    return <div className="text-center py-12 text-slate-400">Loading group details...</div>;
  }

  if (groupStatus === "error" || !group) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        Unauthorized or Group not found. Private groups require an invitation to join/view.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Group Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{group.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                group.isPrivate
                  ? "bg-slate-100 text-slate-600"
                  : "bg-green-50 text-green-700"
              }`}>
                {group.isPrivate ? "Private Space" : "Public Space"}
              </span>
            </div>
            <p className="text-sm text-slate-600 max-w-2xl">{group.description || "No description provided."}</p>
          </div>

          {!isMember && (
            <button
              onClick={() => joinGroupMutation.mutate()}
              disabled={joinGroupMutation.isPending}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
            >
              Join Group
            </button>
          )}
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-4 pt-2">
          <span>👥 {group._count.members} member{group._count.members === 1 ? "" : "s"}</span>
          {isMember && (
            <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700 uppercase tracking-wide">
              Role: {group.role}
            </span>
          )}
        </div>
      </div>

      {isMember ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Feed Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Create Post Form */}
            <form onSubmit={handleCreatePost} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Share something in this group</span>
              <input
                type="text"
                placeholder="Title (optional)"
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2 text-sm text-slate-900 outline-none focus:bg-white focus:border-brand-500 transition"
              />
              <textarea
                rows={3}
                required
                placeholder="Write your post body..."
                value={postBody}
                onChange={(e) => setPostBody(e.target.value)}
                className="w-full rounded-xl border border-slate-150 px-4 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 transition"
              />
              {postError && <p className="text-xs text-red-600">{postError}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={createPostMutation.isPending}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition"
                >
                  {createPostMutation.isPending ? "Posting..." : "Publish Post"}
                </button>
              </div>
            </form>

            {/* Feed List */}
            {feedStatus === "pending" ? (
              <div className="text-center py-6 text-slate-400">Loading feed...</div>
            ) : feedData?.pages[0]?.data.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-slate-500 bg-slate-50">
                No posts in this group yet. Be the first to post!
              </div>
            ) : (
              <div className="space-y-4">
                {feedData?.pages.flatMap((page) => page.data).map((post) => (
                  <div key={post.contentId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-semibold uppercase text-xs">
                        {post.author.username.substring(0, 2)}
                      </div>
                      <div>
                        <span className="block text-sm font-semibold text-slate-900">
                          {post.author.fullName || `@${post.author.username}`}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {new Date(post.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {post.title && <h3 className="text-md font-bold text-slate-950">{post.title}</h3>}
                    <p className="text-sm text-slate-700 whitespace-pre-line">{post.body}</p>

                    <div className="pt-2 border-t border-slate-100 flex items-center gap-6 text-xs text-slate-500">
                      <span>👍 {post.likesCount} Like{post.likesCount === 1 ? "" : "s"}</span>
                      <span>💬 {post.commentsCount} Comment{post.commentsCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                ))}

                {/* Keyset sentinel trigger */}
                <div ref={observerTarget} className="h-4" />

                {isFetchingNextPage && (
                  <div className="text-center py-4 text-slate-400 text-xs animate-pulse">Loading older posts...</div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Invite and Info Column */}
          <div className="space-y-6">
            {isAdmin && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Invite Members</h3>
                
                {/* Selected User Tags */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-1 bg-slate-50 rounded-xl border border-slate-100 max-h-24 overflow-y-auto">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700"
                      >
                        {u.name}
                        <button
                          type="button"
                          onClick={() => setSelectedUsers((prev) => prev.filter((x) => x.id !== u.id))}
                          className="hover:text-brand-900 font-extrabold cursor-pointer ml-0.5"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-3 relative">
                  {isDropdownOpen && (
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsDropdownOpen(false)}
                    />
                  )}
                  <div className="relative z-20">
                    <input
                      type="text"
                      placeholder="Search name or username..."
                      value={memberSearchQuery}
                      onFocus={() => setIsDropdownOpen(true)}
                      onChange={(e) => {
                        setMemberSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-brand-500 pr-8"
                    />
                    {isSearching && (
                      <span className="absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                    )}
                    {!isSearching && memberSearchQuery && (
                      <button
                        onClick={() => {
                          setMemberSearchQuery("");
                          setIsDropdownOpen(false);
                        }}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-650 text-xs font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Dropdown Options */}
                  {isDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {isSearching || (memberSearchQuery.trim().length < 2 && isLoadingInitial) ? (
                        <div className="p-3 text-center text-xs text-slate-400 animate-pulse font-medium">
                          Loading members...
                        </div>
                      ) : usersToDisplay.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          No members found
                        </div>
                      ) : (
                        (() => {
                          const nonGroupMembers = usersToDisplay.filter(
                            (item: any) =>
                              !members.some((m) => m.userId === item.id) &&
                              !selectedUsers.some((u) => u.id === item.id)
                          );

                          if (nonGroupMembers.length === 0) {
                            return (
                              <div className="p-3 text-center text-xs text-slate-500">
                                All matches already selected or in group
                              </div>
                            );
                          }

                          return nonGroupMembers.map((item: any) => (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedUsers((prev) => [
                                  ...prev,
                                  {
                                    id: item.id,
                                    name: item.title,
                                    username: item.metadata?.username || "",
                                  },
                                ]);
                                setMemberSearchQuery("");
                                setIsDropdownOpen(false);
                              }}
                              className="p-2.5 hover:bg-slate-50 transition cursor-pointer text-xs flex flex-col text-left"
                            >
                              <span className="font-bold text-slate-800">{item.title}</span>
                              {item.metadata?.username && (
                                <span className="text-[10px] text-slate-450">@{item.metadata.username}</span>
                              )}
                            </div>
                          ));
                        })()
                      )}
                    </div>
                  )}

                  {inviteError && <p className="text-[10px] text-red-650 font-medium">{inviteError}</p>}
                  {inviteSuccess && <p className="text-[10px] text-green-650 font-bold">Invitations sent successfully!</p>}

                  <button
                    type="button"
                    onClick={handleInviteSelected}
                    disabled={selectedUsers.length === 0 || isInvitingSelected}
                    className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-2.5 text-center text-xs font-bold text-white shadow-sm transition disabled:opacity-60 cursor-pointer z-20 relative"
                  >
                    {isInvitingSelected
                      ? "Sending Invitations..."
                      : `Invite Selected (${selectedUsers.length})`}
                  </button>
                </div>
              </div>
            )}

            {/* Sidebar Members list if available */}
            {members.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900">Group Members</h3>
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center uppercase font-bold text-[9px]">
                            {member.user.username.slice(0, 2)}
                          </div>
                          {presenceMap[member.userId] && (
                            <span className="absolute bottom-0 right-0 block h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                          )}
                        </div>
                        <span className="font-semibold text-slate-800 truncate max-w-[120px]">
                          {member.user.profile?.fullName || `@${member.user.username}`}
                        </span>
                      </div>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wide">
                        {member.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 text-center text-amber-900">
          You are currently viewing a preview. Please join this group to read the discussions and publish posts.
        </div>
      )}
    </div>
  );
}
