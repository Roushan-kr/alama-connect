"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import { useAdminNetwork } from "@/contexts/adminNetwork";

interface NetworkMember {
  userId: string;
  role: "STUDENT" | "ALUMNI" | "FACULTY" | "ADMIN";
  status: "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  joinedAt: string;
  user: {
    email: string;
    username: string;
    profile: {
      fullName: string | null;
      profileImage: string | null;
    } | null;
  };
}

export default function MemberManagementPage() {
  const { networkId, isLoading: networkLoading } = useAdminNetwork();
  const { accessToken, user: currentUser } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Selections for bulk actions
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCursor(undefined); // reset pagination when query changes
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Guard redirect
  useEffect(() => {
    if (!networkLoading && !networkId) {
      router.push("/feed");
    }
  }, [networkId, networkLoading, router]);

  // Query members
  const { data, isLoading, isError, refetch } = useQuery<{
    data: NetworkMember[];
    meta: { nextCursor: string | null; hasMore: boolean };
  }>({
    queryKey: ["network-members", networkId, debouncedSearch, roleFilter, statusFilter, cursor],
    queryFn: () => {
      let url = `/api/admin/network/${networkId}/members?limit=20`;
      if (debouncedSearch) url += `&q=${encodeURIComponent(debouncedSearch)}`;
      if (roleFilter !== "ALL") url += `&role=${roleFilter}`;
      if (statusFilter !== "ALL") url += `&status=${statusFilter}`;
      if (cursor) url += `&cursor=${cursor}`;
      return apiRequest(url, { token: accessToken });
    },
    enabled: !!accessToken && !!networkId,
  });

  const members = data?.data || [];
  const nextCursor = data?.meta?.nextCursor;

  // Single Role Change Mutation
  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiRequest(`/api/admin/network/${networkId}/members/${userId}/role`, {
        method: "PUT",
        token: accessToken,
        body: { role },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["network-members"] });
    },
    onError: (err: any) => {
      alert("Failed to change role: " + err.message);
    },
  });

  // Single Remove Mutation
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/api/admin/network/${networkId}/members/${userId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      setSelectedUserIds((prev) => prev.filter((id) => id !== id));
      queryClient.invalidateQueries({ queryKey: ["network-members"] });
    },
    onError: (err: any) => {
      alert("Failed to remove member: " + err.message);
    },
  });

  // Bulk Role Change Mutation
  const bulkChangeRoleMutation = useMutation({
    mutationFn: async ({ userIds, role }: { userIds: string[]; role: string }) => {
      // Execute role changes in parallel
      await Promise.all(
        userIds.map((uid) =>
          apiRequest(`/api/admin/network/${networkId}/members/${uid}/role`, {
            method: "PUT",
            token: accessToken,
            body: { role },
          }),
        ),
      );
    },
    onSuccess: () => {
      setSelectedUserIds([]);
      setBulkRole("");
      queryClient.invalidateQueries({ queryKey: ["network-members"] });
    },
    onError: (err: any) => {
      alert("Failed to complete bulk role update: " + err.message);
    },
  });

  // Bulk Remove Mutation
  const bulkRemoveMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      await Promise.all(
        userIds.map((uid) =>
          apiRequest(`/api/admin/network/${networkId}/members/${uid}`, {
            method: "DELETE",
            token: accessToken,
          }),
        ),
      );
    },
    onSuccess: () => {
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ["network-members"] });
    },
    onError: (err: any) => {
      alert("Failed to complete bulk removal: " + err.message);
    },
  });

  const handleRoleSelect = (userId: string, newRole: string) => {
    if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      changeRoleMutation.mutate({ userId, role: newRole });
    }
  };

  const handleRemoveMember = (userId: string) => {
    if (confirm("Are you sure you want to remove this member from the network? This does not delete their user account, only their network affiliation.")) {
      removeMemberMutation.mutate(userId);
    }
  };

  const toggleSelectAll = () => {
    const selectable = members.filter((m) => m.userId !== currentUser?.userId);
    if (selectedUserIds.length === selectable.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(selectable.map((m) => m.userId));
    }
  };

  const toggleSelectMember = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    } else {
      setSelectedUserIds((prev) => [...prev, userId]);
    }
  };

  const handleBulkChangeRoleSubmit = () => {
    if (!bulkRole) return;
    if (confirm(`Are you sure you want to update the role of ${selectedUserIds.length} members to ${bulkRole}?`)) {
      bulkChangeRoleMutation.mutate({ userIds: selectedUserIds, role: bulkRole });
    }
  };

  const handleBulkRemoveSubmit = () => {
    if (confirm(`Are you sure you want to remove ${selectedUserIds.length} members from this network?`)) {
      bulkRemoveMutation.mutate(selectedUserIds);
    }
  };

  if (networkLoading || (!networkId && !networkLoading)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const selectableMembers = members.filter((m) => m.userId !== currentUser?.userId);
  const allSelected = selectableMembers.length > 0 && selectedUserIds.length === selectableMembers.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Network Members</h1>
        <p className="text-sm text-slate-500">
          Manage roles, approve or review network membership, or remove users.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, email, or handle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
          />
          <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Role</span>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setCursor(undefined);
            }}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT">Student</option>
            <option value="ALUMNI">Alumni</option>
            <option value="FACULTY">Faculty</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCursor(undefined);
            }}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="PENDING">Pending</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Members List Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isError ? (
          <div className="p-8 text-center space-y-4">
            <div className="text-sm text-red-500 font-semibold">Failed to fetch network members.</div>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((n) => (
              <div key={n} className="p-6 flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-3 w-48 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No network members found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400">
                  <th className="px-6 py-4 w-12">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                    />
                  </th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Joined</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {members.map((member) => {
                  const name = member.user.profile?.fullName || member.user.username;
                  const isSelf = member.userId === currentUser?.userId;

                  return (
                    <tr key={member.userId} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4">
                        {!isSelf && (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(member.userId)}
                            onChange={() => toggleSelectMember(member.userId)}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 flex items-center gap-3">
                        {/* Avatar */}
                        <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-bold text-xs uppercase overflow-hidden">
                          {member.user.profile?.profileImage ? (
                            <img
                              src={member.user.profile.profileImage}
                              alt={name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            name.substring(0, 2)
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{name}</div>
                          <div className="text-[10px] text-slate-400">@{member.user.username}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isSelf ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {member.role} (Self)
                          </span>
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleSelect(member.userId, e.target.value)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
                          >
                            <option value="STUDENT">Student</option>
                            <option value="ALUMNI">Alumni</option>
                            <option value="FACULTY">Faculty</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            member.status === "VERIFIED"
                              ? "bg-emerald-50 text-emerald-700"
                              : member.status === "REJECTED"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {new Date(member.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!isSelf && (
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="text-red-600 hover:text-red-700 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setCursor(nextCursor)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            Load More Members
          </button>
        </div>
      )}

      {/* Floating Action Bar for Bulk Selections */}
      {selectedUserIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 animate-in fade-in slide-in-from-bottom-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-4 shadow-xl flex items-center justify-between text-white gap-4">
            <span className="text-xs font-semibold">
              {selectedUserIds.length} member{selectedUserIds.length > 1 ? "s" : ""} selected
            </span>

            <div className="flex items-center gap-3">
              {/* Change Role */}
              <div className="flex items-center gap-1.5 bg-slate-800 rounded-xl px-2.5 py-1">
                <select
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value)}
                  className="bg-transparent border-none text-xs outline-none text-slate-200 cursor-pointer pr-4"
                >
                  <option value="" disabled className="bg-slate-900">Change role...</option>
                  <option value="STUDENT" className="bg-slate-900">Student</option>
                  <option value="ALUMNI" className="bg-slate-900">Alumni</option>
                  <option value="FACULTY" className="bg-slate-900">Faculty</option>
                  <option value="ADMIN" className="bg-slate-900">Admin</option>
                </select>
                <button
                  onClick={handleBulkChangeRoleSubmit}
                  disabled={!bulkRole}
                  className="text-[10px] font-bold uppercase tracking-wider text-brand-400 hover:text-brand-300 disabled:opacity-40"
                >
                  Apply
                </button>
              </div>

              {/* Remove */}
              <button
                onClick={handleBulkRemoveSubmit}
                className="rounded-xl bg-red-600 hover:bg-red-700 px-3.5 py-1.5 text-xs font-bold transition-all shadow"
              >
                Remove Bulk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
