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
  const [announceStatus, setAnnounceStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Newsletter form state
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [newsStatus, setNewsStatus] = useState<{ success?: boolean; error?: string } | null>(null);

  // Load user profile to identify networks where they are ADMIN
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me-admin"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
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
    }
  }, [profile, selectedNetworkId]);

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
    mutationFn: (body: { title: string; body: string; networkId: string }) =>
      apiRequest("/api/admin/announcements", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setAnnounceTitle("");
      setAnnounceBody("");
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
    mutationFn: (body: { title: string; body: string; networkId: string }) =>
      apiRequest("/api/admin/newsletters", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setNewsTitle("");
      setNewsBody("");
      setNewsStatus({ success: true });
      refetchStats();
      setTimeout(() => setNewsStatus(null), 5000);
    },
    onError: (err: any) => {
      setNewsStatus({ error: err.message || "Failed to dispatch newsletter" });
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
    });
  };

  if (adminNetworks.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <h2 className="text-base font-bold">Access Denied</h2>
        <p className="text-xs mt-1">You must be a verified Administrator of at least one network to access this page.</p>
      </div>
    );
  }

  const selectedNetworkName =
    adminNetworks.find((n) => n.networkId === selectedNetworkId)?.network?.name || "chosen network";

  const stats = analyticsData;

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
        {adminNetworks.length > 1 && (
          <div>
            <select
              value={selectedNetworkId || ""}
              onChange={(e) => setSelectedNetworkId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:border-brand-500"
            >
              {adminNetworks.map((net) => (
                <option key={net.networkId} value={net.networkId}>
                  {net.network?.name || net.networkId}
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
        ) : loadingStats || !stats ? (
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
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{stats.membersCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Verified accounts</span>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Jobs</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{stats.activeJobsCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Not yet expired</span>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Connections</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{stats.connectionsCount}</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Network-scoped pairs</span>
            </div>

            {/* Metric 4 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">New Posts</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-2 block">{stats.postsCount}</span>
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
              Creates a network-wide notification row and broadcasts real-time to all verified members.
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
    </div>
  );
}
