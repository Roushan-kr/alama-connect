"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

interface NetworkItem {
  networkId: string;
  name: string;
  code: string;
  createdAt: string;
  memberCount: number;
}

interface NetworkAdmin {
  userId: string;
  fullName: string | null;
  email: string;
  joinedAt: string;
}

interface UserItem {
  userId: string;
  email: string;
  username: string;
  globalRole: string;
  emailVerified: boolean;
  profile: {
    fullName: string | null;
    profileImage: string | null;
  } | null;
}

interface PlatformMetrics {
  totalUsers: number;
  totalVerifiedUsers: number;
  totalNetworks: number;
  totalPosts: number;
  totalCampaignsSent: number;
}

export default function SuperAdminPage() {
  const { user: currentUser, accessToken } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"networks" | "users" | "metrics">("networks");

  // Network admin drawer state
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkItem | null>(null);

  // User search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [disablingUserId, setDisablingUserId] = useState<string | null>(null);
  const [disableReason, setDisableReason] = useState("");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Guard: redirect non-super-admins
  useEffect(() => {
    if (currentUser && currentUser.globalRole !== "SUPER_ADMIN") {
      router.push("/feed");
    }
  }, [currentUser, router]);

  if (!currentUser || currentUser.globalRole !== "SUPER_ADMIN") {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Platform Administration</h1>
        <p className="text-sm text-slate-500">
          Global operations center for managing networks, users, and platform-wide performance.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 shadow-sm max-w-md">
        {(["networks", "users", "metrics"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all capitalize ${
              activeTab === tab
                ? "bg-brand-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Conditional tab rendering */}
      {activeTab === "networks" && (
        <NetworksTab
          accessToken={accessToken}
          onManageAdmins={(net) => setSelectedNetwork(net)}
        />
      )}

      {activeTab === "users" && (
        <UsersTab
          accessToken={accessToken}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          debouncedSearch={debouncedSearch}
          currentUserId={currentUser.userId}
          onDisableUser={(uid) => setDisablingUserId(uid)}
        />
      )}

      {activeTab === "metrics" && <MetricsTab accessToken={accessToken} />}

      {/* Conditional Right-Side Fixed Drawer for Network Admin management */}
      {selectedNetwork && (
        <AdminsDrawer
          accessToken={accessToken}
          network={selectedNetwork}
          onClose={() => setSelectedNetwork(null)}
        />
      )}

      {/* Disable Account Modal */}
      {disablingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Disable User Account</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Are you sure you want to disable this user? They will be logged out of all active sessions and blocked from signing in.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Reason for Disabling
              </label>
              <textarea
                placeholder="Violated platform code of conduct / spam accounts."
                rows={4}
                value={disableReason}
                onChange={(e) => setDisableReason(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDisablingUserId(null);
                  setDisableReason("");
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <DisableButton
                accessToken={accessToken}
                userId={disablingUserId}
                reason={disableReason}
                onSuccess={() => {
                  setDisablingUserId(null);
                  setDisableReason("");
                  queryClient.invalidateQueries({ queryKey: ["super-users"] });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NETWORKS TAB ─────────────────────────────────────────────────────────────
function NetworksTab({
  accessToken,
  onManageAdmins,
}: {
  accessToken: string | null;
  onManageAdmins: (net: NetworkItem) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery<NetworkItem[]>({
    queryKey: ["super-networks"],
    queryFn: () => apiRequest("/api/admin/super/networks", { token: accessToken }),
    enabled: !!accessToken,
  });

  const networks = data || [];

  if (isError) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-4">
        <div className="text-sm text-red-500 font-semibold">Failed to fetch networks.</div>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-slate-100 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400 font-mono">
              <th className="px-6 py-4">Network Name</th>
              <th className="px-6 py-4">Code</th>
              <th className="px-6 py-4">Verified Members</th>
              <th className="px-6 py-4">Created Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {networks.map((net) => (
              <tr key={net.networkId} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-900">{net.name}</td>
                <td className="px-6 py-4 font-mono font-bold text-brand-600">{net.code}</td>
                <td className="px-6 py-4 font-semibold text-slate-600">{net.memberCount}</td>
                <td className="px-6 py-4 text-slate-400">
                  {new Date(net.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => onManageAdmins(net)}
                    className="rounded-lg bg-brand-50 hover:bg-brand-100 px-3 py-1.5 text-xs font-bold text-brand-700 transition-all"
                  >
                    Manage admins
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── NETWORK ADMINS DRAWER ─────────────────────────────────────────────────────
function AdminsDrawer({
  accessToken,
  network,
  onClose,
}: {
  accessToken: string | null;
  network: NetworkItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<NetworkAdmin[]>({
    queryKey: ["super-network-admins", network.networkId],
    queryFn: () =>
      apiRequest(`/api/admin/super/networks/${network.networkId}/admins`, { token: accessToken }),
    enabled: !!accessToken && !!network.networkId,
  });

  const updateAdminRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiRequest(`/api/admin/super/networks/${network.networkId}/admins/${userId}`, {
        method: "PUT",
        token: accessToken,
        body: { role },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-network-admins", network.networkId] });
      queryClient.invalidateQueries({ queryKey: ["super-networks"] });
      alert("Admin status updated successfully.");
    },
    onError: (err: any) => {
      alert("Failed to update admin role: " + err.message);
    },
  });

  const admins = data || [];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col p-6 animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Manage Admins</h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{network.name}</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg hover:bg-slate-50 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {isError ? (
          <div className="text-center p-4">
            <p className="text-xs text-red-500 font-semibold mb-2">Failed to load network admins.</p>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 bg-slate-50 rounded-xl" />
            ))}
          </div>
        ) : admins.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-8">No administrator accounts in this network.</p>
        ) : (
          <div className="space-y-4">
            {admins.map((admin) => (
              <div key={admin.userId} className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50 space-y-3">
                <div>
                  <div className="font-bold text-slate-800 text-xs">{admin.fullName || "Unnamed User"}</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{admin.email}</div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-200/40 pt-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Demote Role</span>
                  <select
                    value="ADMIN"
                    onChange={(e) => {
                      if (e.target.value !== "ADMIN") {
                        if (confirm("Are you sure you want to demote this network admin? They will lose access to the admin panel.")) {
                          updateAdminRoleMutation.mutate({ userId: admin.userId, role: e.target.value });
                        }
                      }
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 bg-white outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value="ADMIN">Admin (Current)</option>
                    <option value="FACULTY">Faculty</option>
                    <option value="ALUMNI">Alumni</option>
                    <option value="STUDENT">Student</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── USERS TAB ─────────────────────────────────────────────────────────────────
function UsersTab({
  accessToken,
  searchQuery,
  setSearchQuery,
  debouncedSearch,
  currentUserId,
  onDisableUser,
}: {
  accessToken: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  debouncedSearch: string;
  currentUserId: string;
  onDisableUser: (uid: string) => void;
}) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useQuery<{
    data: UserItem[];
    nextCursor: string | null;
  }>({
    queryKey: ["super-users", debouncedSearch, cursor],
    queryFn: () => {
      let url = `/api/admin/super/users?limit=20`;
      if (debouncedSearch) url += `&q=${encodeURIComponent(debouncedSearch)}`;
      if (cursor) url += `&cursor=${cursor}`;
      return apiRequest(url, { token: accessToken });
    },
    enabled: !!accessToken,
  });

  const users = data?.data || [];
  const nextCursor = data?.nextCursor;

  return (
    <div className="space-y-6">
      {/* Search Filter */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm max-w-md">
        <div className="relative">
          <input
            type="text"
            placeholder="Search global users by name, email, or handle..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCursor(undefined);
            }}
            className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
          />
          <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm">🔍</span>
        </div>
      </div>

      {/* Users List Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isError ? (
          <div className="p-8 text-center space-y-4">
            <div className="text-sm text-red-500 font-semibold">Failed to fetch users.</div>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-slate-100 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-6 h-16 bg-slate-50" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400 font-mono">
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Global Role</th>
                  <th className="px-6 py-4">Account Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {users.map((item) => {
                  const name = item.profile?.fullName || item.username;
                  const isSelf = item.userId === currentUserId;

                  return (
                    <tr key={item.userId} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-bold text-xs uppercase overflow-hidden">
                          {item.profile?.profileImage ? (
                            <img src={item.profile.profileImage} alt={name} className="h-full w-full object-cover" />
                          ) : (
                            name.substring(0, 2)
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">@{item.username}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono">{item.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.globalRole === "SUPER_ADMIN"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {item.globalRole}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            item.emailVerified ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}
                        >
                          {item.emailVerified ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!isSelf && item.emailVerified && (
                          <button
                            onClick={() => onDisableUser(item.userId)}
                            className="rounded-lg bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 transition-all"
                          >
                            Disable account
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

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setCursor(nextCursor)}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            Load More Users
          </button>
        </div>
      )}
    </div>
  );
}

// ── PLATFORM METRICS TAB ──────────────────────────────────────────────────────
function MetricsTab({ accessToken }: { accessToken: string | null }) {
  const { data, isLoading, isError, refetch } = useQuery<PlatformMetrics>({
    queryKey: ["super-metrics"],
    queryFn: () => apiRequest("/api/admin/super/metrics", { token: accessToken }),
    enabled: !!accessToken,
    refetchInterval: 60000, // Auto-refresh every 60s
  });

  if (isError) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-4">
        <div className="text-sm text-red-500 font-semibold">Failed to fetch platform metrics.</div>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 bg-white border border-slate-200 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 3 + 2 Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Total User Accounts</span>
          <span className="text-3xl font-extrabold text-slate-950 mt-2 block">{data.totalUsers}</span>
          <span className="text-[10px] text-slate-400 block mt-1">Platform-wide registered profiles</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Verified Network Members</span>
          <span className="text-3xl font-extrabold text-slate-950 mt-2 block">{data.totalVerifiedUsers}</span>
          <span className="text-[10px] text-slate-400 block mt-1">Users approved by network admins</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Total Campus Networks</span>
          <span className="text-3xl font-extrabold text-slate-950 mt-2 block">{data.totalNetworks}</span>
          <span className="text-[10px] text-slate-400 block mt-1">CLI-seeded campus directories</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Active Social Posts</span>
          <span className="text-3xl font-extrabold text-slate-950 mt-2 block">{data.totalPosts}</span>
          <span className="text-[10px] text-slate-400 block mt-1">Shared posts in last 30 days</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Completed Email Campaigns</span>
          <span className="text-3xl font-extrabold text-slate-950 mt-2 block">{data.totalCampaignsSent}</span>
          <span className="text-[10px] text-slate-400 block mt-1">Roster mail broadcasts sent</span>
        </div>
      </div>
    </div>
  );
}

// ── DISABLE USER HELPER BUTTON ───────────────────────────────────────────────
function DisableButton({
  accessToken,
  userId,
  reason,
  onSuccess,
}: {
  accessToken: string | null;
  userId: string;
  reason: string;
  onSuccess: () => void;
}) {
  const disableMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/super/users/${userId}/disable`, {
        method: "PATCH",
        token: accessToken,
        body: { reason },
      }),
    onSuccess: () => {
      alert("User account disabled successfully.");
      onSuccess();
    },
    onError: (err: any) => {
      alert("Failed to disable user: " + err.message);
    },
  });

  return (
    <button
      onClick={() => disableMutation.mutate()}
      disabled={disableMutation.isPending}
      className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
    >
      {disableMutation.isPending ? "Disabling..." : "Confirm Disable"}
    </button>
  );
}
