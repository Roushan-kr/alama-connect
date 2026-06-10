"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";
import Link from "next/link";

interface Group {
  groupId: string;
  networkId: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  createdBy: string;
  createdAt: string;
  _count: {
    members: number;
  };
}

interface ProfileResponse {
  userId: string;
  networkMemberships: Array<{
    networkId: string;
    status: string;
    role: string;
    network: { name: string; code: string };
  }>;
}

export default function GroupsPage() {
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [newGroupPrivate, setNewGroupPrivate] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  // Fetch verified network
  const { data: profile } = useQuery<ProfileResponse>({
    queryKey: ["profile", user?.userId],
    queryFn: () => apiRequest<ProfileResponse>("/api/users/me", { token: accessToken }),
    enabled: !!accessToken && !!user?.userId,
  });

  const verifiedMembership = profile?.networkMemberships.find((m) => m.status === "VERIFIED");
  const networkId = verifiedMembership?.networkId;

  // List Groups
  const { data: groups = [], status } = useQuery<Group[]>({
    queryKey: ["groups", networkId],
    queryFn: () => apiRequest<Group[]>(`/api/groups?networkId=${networkId}`, { token: accessToken }),
    enabled: !!accessToken && !!networkId,
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: (newGroup: any) =>
      apiRequest("/api/groups", {
        method: "POST",
        token: accessToken,
        body: {
          networkId,
          ...newGroup,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setShowCreateModal(false);
      setNewGroupName("");
      setNewGroupDesc("");
      setNewGroupPrivate(true);
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(err.message || "Failed to create group");
    },
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) {
      setCreateError("Group name is required");
      return;
    }
    createGroupMutation.mutate({
      name: newGroupName,
      description: newGroupDesc,
      isPrivate: newGroupPrivate,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Communities & Groups</h1>
          <p className="text-slate-500 mt-1">Join specialized discussion and topic channels in your network</p>
        </div>
        {networkId && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            Create Group
          </button>
        )}
      </div>

      {status === "pending" ? (
        <div className="text-center py-12 text-slate-400">Loading groups...</div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500 bg-slate-50">
          No groups found in your network. Create one to start discussions!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <Link
              key={group.groupId}
              href={`/groups/${group.groupId}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition duration-200 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition">
                    {group.name}
                  </h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    group.isPrivate
                      ? "bg-slate-100 text-slate-600"
                      : "bg-green-50 text-green-700"
                  }`}>
                    {group.isPrivate ? "Private" : "Public"}
                  </span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 min-h-[2.5rem]">
                  {group.description || "No description provided."}
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
                <span>👥 {group._count.members} member{group._count.members === 1 ? "" : "s"}</span>
                <span className="font-semibold text-brand-600 group-hover:underline">Visit Space →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-150 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-bold text-slate-950 font-sans">Create a new Group</h2>
            <p className="text-xs text-slate-500 mt-1">Start a space for specialized tags and student/alumni teams</p>

            <form onSubmit={handleCreateGroup} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Group Name *
                <input
                  type="text"
                  required
                  placeholder="e.g. Placement Prep 2026"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Description
                <textarea
                  rows={3}
                  placeholder="What is this group about?"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                <div>
                  <span className="block text-sm font-semibold text-slate-900">Private Community</span>
                  <span className="block text-[11px] text-slate-400">Only invited members can view the conversations</span>
                </div>
                <input
                  type="checkbox"
                  checked={newGroupPrivate}
                  onChange={(e) => setNewGroupPrivate(e.target.checked)}
                  className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                />
              </div>

              {createError && <p className="text-xs text-red-600">{createError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createGroupMutation.isPending}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition"
                >
                  {createGroupMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
