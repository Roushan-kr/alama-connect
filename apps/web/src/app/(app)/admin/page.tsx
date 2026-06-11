"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

interface AdminAnalytics {
  membersCount: number;
  activeJobsCount: number;
  connectionsCount: number;
  postsCount: number;
}

export default function AdminPage() {
  const { accessToken } = useAuthStore();
  const [adminNetworks, setAdminNetworks] = useState<any[]>([]);
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null);

  // Announcement form state
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceTargetType, setAnnounceTargetType] = useState<"NETWORK" | "GROUP">("NETWORK");
  const [announceGroupId, setAnnounceGroupId] = useState<string | null>(null);
  const [announceStatus, setAnnounceStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Newsletter form state
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [newsTargetType, setNewsTargetType] = useState<"NETWORK" | "GROUP">("NETWORK");
  const [newsGroupId, setNewsGroupId] = useState<string | null>(null);
  const [newsStatus, setNewsStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Super Admin Broadcast state
  const [superBroadcastType, setSuperBroadcastType] = useState<"ANNOUNCEMENT" | "NEWSLETTER">("ANNOUNCEMENT");
  const [superTitle, setSuperTitle] = useState("");
  const [superBody, setSuperBody] = useState("");
  const [superSelectedNetworks, setSuperSelectedNetworks] = useState<string[]>([]);
  const [superSelectedGroups, setSuperSelectedGroups] = useState<string[]>([]);
  const [superStatus, setSuperStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Load user profile to identify networks where they are ADMIN
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me-admin"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  });

  const isSuperAdmin = profile?.globalRole === "SUPER_ADMIN";

  // Load all networks (available for Super Admins or dropdown selections)
  const { data: allNetworksData } = useQuery<any>({
    queryKey: ["all-networks"],
    queryFn: () => apiRequest("/api/networks"),
    enabled: !!accessToken,
  });

  // Load all groups of selected network
  const { data: groupsData } = useQuery<any>({
    queryKey: ["admin-network-groups", selectedNetworkId],
    queryFn: () => apiRequest(`/api/groups?networkId=${selectedNetworkId}`, { token: accessToken }),
    enabled: !!accessToken && !!selectedNetworkId,
  });

  // Load all groups (for Super Admin multi-select across all networks)
  const { data: allGroupsData } = useQuery<any>({
    queryKey: ["all-groups-flat"],
    queryFn: async () => {
      if (!allNetworksData?.data) return [];
      const promises = allNetworksData.data.map((net: any) =>
        apiRequest(`/api/groups?networkId=${net.networkId}`, { token: accessToken })
          .then((res: any) => res?.data || [])
          .catch(() => [])
      );
      const results = await Promise.all(promises);
      return results.flat();
    },
    enabled: !!accessToken && isSuperAdmin && !!allNetworksData?.data,
  });

  useEffect(() => {
    if (profile?.networkMemberships) {
      const admins = profile.networkMemberships.filter(
        (m: any) => m.role === "ADMIN" && m.status === "VERIFIED"
      );
      setAdminNetworks(admins);
      if (admins.length > 0 && !selectedNetworkId) {
        setSelectedNetworkId(admins[0].networkId);
      }
    } else if (isSuperAdmin && allNetworksData?.data && !selectedNetworkId) {
      setSelectedNetworkId(allNetworksData.data[0]?.networkId);
    }
  }, [profile, selectedNetworkId, allNetworksData, isSuperAdmin]);

  // Fetch Analytics stats for selected network
  const {
    data: analyticsData,
    isLoading: loadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery<AdminAnalytics>({
    queryKey: ["admin-analytics", selectedNetworkId],
    queryFn: () =>
      apiRequest<AdminAnalytics>(`/api/admin/analytics/${selectedNetworkId}`, {
        token: accessToken,
      }),
    enabled: !!accessToken && !!selectedNetworkId,
  });

  // Dispatch Announcement mutation
  const announcementMutation = useMutation({
    mutationFn: (body: { title: string; body: string; networkId: string; groupId?: string }) =>
      apiRequest("/api/admin/announcements", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setAnnounceTitle("");
      setAnnounceBody("");
      setAnnounceGroupId(null);
      setAnnounceStatus({ success: true });
      refetchStats();
      setTimeout(() => setAnnounceStatus(null), 5000);
    },
    onError: (err: any) => {
      setAnnounceStatus({ error: err.message || "Failed to dispatch announcement" });
    },
  });

  // Dispatch Newsletter mutation
  const newsletterMutation = useMutation({
    mutationFn: (body: { title: string; body: string; networkId: string; groupId?: string }) =>
      apiRequest("/api/admin/newsletters", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setNewsTitle("");
      setNewsBody("");
      setNewsGroupId(null);
      setNewsStatus({ success: true });
      refetchStats();
      setTimeout(() => setNewsStatus(null), 5000);
    },
    onError: (err: any) => {
      setNewsStatus({ error: err.message || "Failed to dispatch newsletter" });
    },
  });

  // Dispatch Super Admin Broadcast mutation
  const superBroadcastMutation = useMutation({
    mutationFn: (body: {
      networkIds: string[];
      groupIds: string[];
      type: "ANNOUNCEMENT" | "NEWSLETTER";
      title: string;
      body: string;
    }) =>
      apiRequest("/api/admin/super/broadcast", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setSuperTitle("");
      setSuperBody("");
      setSuperSelectedNetworks([]);
      setSuperSelectedGroups([]);
      setSuperStatus({ success: true });
      setTimeout(() => setSuperStatus(null), 5000);
    },
    onError: (err: any) => {
      setSuperStatus({ error: err.message || "Failed to initiate super broadcast" });
    },
  });

  const handleSendAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceBody.trim() || !selectedNetworkId) return;
    setAnnounceStatus(null);
    announcementMutation.mutate({
      title: announceTitle,
      body: announceBody,
      networkId: selectedNetworkId,
      ...(announceTargetType === "GROUP" && announceGroupId ? { groupId: announceGroupId } : {}),
    });
  };

  const handleSendNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsBody.trim() || !selectedNetworkId) return;
    setNewsStatus(null);
    newsletterMutation.mutate({
      title: newsTitle,
      body: newsBody,
      networkId: selectedNetworkId,
      ...(newsTargetType === "GROUP" && newsGroupId ? { groupId: newsGroupId } : {}),
    });
  };

  const handleSuperBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!superTitle.trim() || !superBody.trim()) return;
    if (superSelectedNetworks.length === 0 && superSelectedGroups.length === 0) {
      setSuperStatus({ error: "Please select at least one network or group target." });
      return;
    }
    setSuperStatus(null);
    superBroadcastMutation.mutate({
      networkIds: superSelectedNetworks,
      groupIds: superSelectedGroups,
      type: superBroadcastType,
      title: superTitle,
      body: superBody,
    });
  };

  if (adminNetworks.length === 0 && !isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <h2 className="text-base font-bold">Access Denied</h2>
        <p className="text-xs mt-1">You must be a verified Administrator of at least one network to access this page.</p>
      </div>
    );
  }

  const activeNetworks = isSuperAdmin ? (allNetworksData?.data || []) : adminNetworks.map(n => n.network);
  const selectedNetworkName =
    activeNetworks.find((n: any) => n.networkId === selectedNetworkId)?.name || "chosen network";

  return (
    <div className="space-y-8">
      {/* Admin Header with Selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Control Panel</h1>
          <p className="text-sm text-slate-500 mt-1">
            Managing network: <span className="font-semibold text-brand-600">{selectedNetworkName}</span>
          </p>
        </div>

        {/* Network Selector if admin of multiple */}
        {activeNetworks.length > 1 && (
          <div>
            <select
              value={selectedNetworkId || ""}
              onChange={(e) => setSelectedNetworkId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:border-brand-500"
            >
              {activeNetworks.map((net: any) => (
                <option key={net.networkId} value={net.networkId}>
                  {net.name || net.networkId}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Analytics Dashboard Grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Network Overview</h2>
        {statsError ? (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-700">
            Failed to load dashboard metrics. Re-authenticating might help.
          </div>
        ) : loadingStats || !analyticsData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-24 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Metric 1 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Members</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{analyticsData.membersCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Verified accounts</span>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Jobs</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{analyticsData.activeJobsCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Not yet expired</span>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Connections</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{analyticsData.connectionsCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Network-scoped pairs</span>
            </div>

            {/* Metric 4 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">New Posts</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{analyticsData.postsCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Last 7 days social feed</span>
            </div>
          </div>
        )}
      </div>

      {/* Forms layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form 1: Announcement Dispatch */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Push In-App Announcement</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Creates a network or group notification row and broadcasts real-time to verified members.
            </p>
          </div>

          {announceStatus?.success && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-800">
              Announcement published successfully and notification queue triggered!
            </div>
          )}

          {announceStatus?.error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">
              {announceStatus.error}
            </div>
          )}

          <form onSubmit={handleSendAnnouncement} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">Target Audience</label>
                <select
                  value={announceTargetType}
                  onChange={(e) => setAnnounceTargetType(e.target.value as "NETWORK" | "GROUP")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:border-brand-500"
                >
                  <option value="NETWORK">Entire Network</option>
                  <option value="GROUP">Specific Group</option>
                </select>
              </div>

              {announceTargetType === "GROUP" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">Target Group</label>
                  <select
                    value={announceGroupId || ""}
                    onChange={(e) => setAnnounceGroupId(e.target.value || null)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:border-brand-500"
                  >
                    <option value="">Select a group...</option>
                    {groupsData?.data?.map((g: any) => (
                      <option key={g.groupId} value={g.groupId}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Announcement Title</label>
              <input
                type="text"
                placeholder="Important: Placement drive updates..."
                value={announceTitle}
                onChange={(e) => setAnnounceTitle(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Detailed Announcement Message</label>
              <textarea
                placeholder="Full details of the announcement here. Members will see this in their feed and notification center."
                rows={5}
                value={announceBody}
                onChange={(e) => setAnnounceBody(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={announcementMutation.isPending}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
            >
              {announcementMutation.isPending ? "Dispatching..." : "Send In-App Announcement"}
            </button>
          </form>
        </div>

        {/* Form 2: Email Newsletter Dispatch */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Email Newsletter Broadcast</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Triggers Trigger.dev newsletter task to send rate-limited email notifications directly to user emails.
            </p>
          </div>

          {newsStatus?.success && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-800">
              Newsletter published and batch email broadcast initiated!
            </div>
          )}

          {newsStatus?.error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">
              {newsStatus.error}
            </div>
          )}

          <form onSubmit={handleSendNewsletter} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase">Target Audience</label>
                <select
                  value={newsTargetType}
                  onChange={(e) => setNewsTargetType(e.target.value as "NETWORK" | "GROUP")}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:border-brand-500"
                >
                  <option value="NETWORK">Entire Network</option>
                  <option value="GROUP">Specific Group</option>
                </select>
              </div>

              {newsTargetType === "GROUP" && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">Target Group</label>
                  <select
                    value={newsGroupId || ""}
                    onChange={(e) => setNewsGroupId(e.target.value || null)}
                    required
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white text-slate-900 outline-none focus:border-brand-500"
                  >
                    <option value="">Select a group...</option>
                    {groupsData?.data?.map((g: any) => (
                      <option key={g.groupId} value={g.groupId}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Newsletter Subject</label>
              <input
                type="text"
                placeholder="Alumni Newsletter - Spring Edition 2026..."
                value={newsTitle}
                onChange={(e) => setNewsTitle(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase">Email Content Body</label>
              <textarea
                placeholder="Write the content of the newsletter email broadcast here..."
                rows={5}
                value={newsBody}
                onChange={(e) => setNewsBody(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={newsletterMutation.isPending}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
            >
              {newsletterMutation.isPending ? "Broadcasting..." : "Send Email Newsletter"}
            </button>
          </form>
        </div>
      </div>

      {/* Super Admin Section */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 shadow-sm text-white space-y-6">
          <div>
            <h3 className="text-lg font-bold">Super Admin Global Broadcast Panel</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Target multiple networks or groups globally. Recipient lists will be dynamically deduplicated across target categories.
            </p>
          </div>

          {superStatus?.success && (
            <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-3 text-xs text-emerald-400">
              Bulk broadcast request accepted and task queued!
            </div>
          )}

          {superStatus?.error && (
            <div className="bg-red-950 border border-red-800 rounded-xl p-3 text-xs text-red-400">
              {superStatus.error}
            </div>
          )}

          <form onSubmit={handleSuperBroadcast} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Select Networks (Multi-select) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Target Networks</label>
                <div className="border border-slate-800 rounded-xl p-3 max-h-[160px] overflow-y-auto space-y-2 bg-slate-900">
                  {allNetworksData?.data?.map((net: any) => (
                    <label key={net.networkId} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        value={net.networkId}
                        checked={superSelectedNetworks.includes(net.networkId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSuperSelectedNetworks([...superSelectedNetworks, net.networkId]);
                          } else {
                            setSuperSelectedNetworks(superSelectedNetworks.filter(id => id !== net.networkId));
                          }
                        }}
                        className="rounded text-brand-600 border-slate-800 bg-slate-950"
                      />
                      {net.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Select Groups (Multi-select) */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">Target Groups</label>
                <div className="border border-slate-800 rounded-xl p-3 max-h-[160px] overflow-y-auto space-y-2 bg-slate-900">
                  {allGroupsData?.map((grp: any) => (
                    <label key={grp.groupId} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        value={grp.groupId}
                        checked={superSelectedGroups.includes(grp.groupId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSuperSelectedGroups([...superSelectedGroups, grp.groupId]);
                          } else {
                            setSuperSelectedGroups(superSelectedGroups.filter(id => id !== grp.groupId));
                          }
                        }}
                        className="rounded text-brand-600 border-slate-800 bg-slate-950"
                      />
                      {grp.name} <span className="text-[10px] text-slate-500 font-mono">({grp.networkId.slice(0, 4)})</span>
                    </label>
                  ))}
                  {(!allGroupsData || allGroupsData.length === 0) && (
                    <div className="text-slate-500 text-xs py-2 text-center">No groups available.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 uppercase">Broadcast Channel</label>
                <select
                  value={superBroadcastType}
                  onChange={(e) => setSuperBroadcastType(e.target.value as "ANNOUNCEMENT" | "NEWSLETTER")}
                  className="w-full rounded-xl border border-slate-800 px-3 py-2 text-sm bg-slate-900 text-white outline-none focus:border-brand-500"
                >
                  <option value="ANNOUNCEMENT">Push In-App Announcement</option>
                  <option value="NEWSLETTER">Email Newsletter Broadcast</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 uppercase">Broadcast Title / Subject</label>
                <input
                  type="text"
                  placeholder="Platform-wide alert..."
                  value={superTitle}
                  onChange={(e) => setSuperTitle(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-800 px-3 py-2 text-sm bg-slate-900 text-white outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 uppercase">Detailed Content Message</label>
              <textarea
                placeholder="Broadcast body details..."
                rows={4}
                value={superBody}
                onChange={(e) => setSuperBody(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-800 px-3 py-2.5 text-sm bg-slate-900 text-white outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={superBroadcastMutation.isPending}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 py-3 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
            >
              {superBroadcastMutation.isPending ? "Queuing Broadcast..." : "Submit Global Broadcast"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
