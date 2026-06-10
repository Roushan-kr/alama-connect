"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export default function CampaignsPage() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [networkId, setNetworkId] = useState<string | null>(null);

  // Announcement/Campaign creation fields
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [branch, setBranch] = useState("");
  const [batch, setBatch] = useState("");
  const [role, setRole] = useState("");
  const [sendImmediately, setSendImmediately] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ success?: boolean; error?: string } | null>(null);

  // Load user profile to identify networks where they are ADMIN
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me-campaigns"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  });

  const adminNetworks = profile?.networkMemberships?.filter(
    (m: any) => m.role === "ADMIN" && m.status === "VERIFIED"
  ) || [];

  if (adminNetworks.length > 0 && !networkId) {
    setNetworkId(adminNetworks[0].networkId);
  }

  // Fetch campaigns
  const { data: campaignsData } = useQuery<any>({
    queryKey: ["campaigns", networkId],
    queryFn: () =>
      apiRequest(`/api/admin/roster/campaigns?networkId=${networkId}`, {
        token: accessToken,
      }),
    enabled: !!accessToken && !!networkId,
  });

  // Create Campaign Mutation
  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("/api/admin/roster/campaigns", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setName("");
      setSubject("");
      setBodyTemplate("");
      setBranch("");
      setBatch("");
      setRole("");
      setSendImmediately(false);
      setStatusMessage({ success: true });
      queryClient.invalidateQueries({ queryKey: ["campaigns", networkId] });
      setTimeout(() => setStatusMessage(null), 5000);
    },
    onError: (err: any) => {
      setStatusMessage({ error: err.message || "Failed to create campaign" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!networkId) return;

    // Build filter map
    const filter: Record<string, any> = {};
    if (branch.trim()) filter.branch = branch.trim();
    if (batch.trim()) filter.batch = parseInt(batch.trim(), 10);
    if (role.trim()) filter.role = role.trim();

    if (Object.keys(filter).length === 0) {
      setStatusMessage({ error: "At least one filter field is required to prevent accidental network-wide sends" });
      return;
    }

    createMutation.mutate({
      networkId,
      name,
      subject,
      bodyTemplate,
      filter,
      sendImmediately,
    });
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Email Campaign Manager</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create templates, segment recipients via roster filters, and broadcast emails.
          </p>
        </div>

        {adminNetworks.length > 1 && (
          <div>
            <select
              value={networkId || ""}
              onChange={(e) => setNetworkId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:border-brand-500"
            >
              {adminNetworks.map((net: any) => (
                <option key={net.networkId} value={net.networkId}>
                  {net.network?.name || net.networkId}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Creation Form */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-950">New Email Campaign</h2>

          {statusMessage?.success && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs text-emerald-800">
              Campaign created successfully!
            </div>
          )}

          {statusMessage?.error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">
              {statusMessage.error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Campaign Name</label>
                <input
                  type="text"
                  placeholder="CSE Placement Prep Guide..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Email Subject Line</label>
                <input
                  type="text"
                  placeholder="Prepare for your placements with this guide"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Filter segments */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Filter Target Roster Segment (At least 1 required)
              </span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-600">Branch</label>
                  <input
                    type="text"
                    placeholder="CSE"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none bg-white focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-600">Batch Year</label>
                  <input
                    type="number"
                    placeholder="2026"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none bg-white focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-600">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none bg-white focus:border-brand-500"
                  >
                    <option value="">All Roles</option>
                    <option value="STUDENT">STUDENT</option>
                    <option value="ALUMNI">ALUMNI</option>
                    <option value="FACULTY">FACULTY</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Template Body */}
            <div className="space-y-1">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-slate-700 uppercase">Email body template</label>
                <span className="text-[9px] text-slate-400 font-mono">
                  Supported vars: {"{{studentName}}"}, {"{{entryNumber}}"}, {"{{branch}}"}, {"{{batch}}"}
                </span>
              </div>
              <textarea
                placeholder="Dear {{studentName}},&#10;&#10;Here is the placement prep guide for the CSE branch of the batch of {{batch}}."
                rows={8}
                value={bodyTemplate}
                onChange={(e) => setBodyTemplate(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="send-immediately-check"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                className="rounded text-brand-600 border-slate-200"
              />
              <label htmlFor="send-immediately-check" className="text-xs font-semibold text-slate-700 cursor-pointer">
                Save and Send immediately (One API call)
              </label>
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
            >
              {createMutation.isPending ? "Processing..." : "Create Campaign"}
            </button>
          </form>
        </div>

        {/* Existing Campaigns List */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Campaign History</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {campaignsData?.data?.map((campaign: any) => (
              <div key={campaign.campaignId} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
                <div className="flex justify-between items-start gap-1">
                  <span className="font-semibold text-xs text-slate-800 truncate block max-w-[150px]">
                    {campaign.name}
                  </span>
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${
                      campaign.status === "COMPLETE"
                        ? "bg-emerald-50 text-emerald-700"
                        : campaign.status === "SENDING"
                        ? "bg-brand-50 text-brand-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {campaign.status}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 block font-mono">ID: {campaign.campaignId.slice(0, 8)}...</span>
                {campaign.sendSummary && (
                  <div className="text-[10px] text-slate-500 flex justify-between bg-white/50 p-1.5 rounded border border-slate-100">
                    <span>Sent: <strong>{campaign.sendSummary.sent}</strong></span>
                    <span>Failed: <strong>{campaign.sendSummary.failed}</strong></span>
                  </div>
                )}
                {campaign.status === "DRAFT" && (
                  <button
                    onClick={async () => {
                      await apiRequest(`/api/admin/roster/campaigns/${campaign.campaignId}/send`, {
                        method: "POST",
                        token: accessToken,
                      });
                      queryClient.invalidateQueries({ queryKey: ["campaigns", networkId] });
                    }}
                    className="w-full rounded bg-slate-900 hover:bg-slate-800 text-white text-[9px] font-bold py-1.5 transition-colors"
                  >
                    Send Campaign Now
                  </button>
                )}
              </div>
            ))}
            {(!campaignsData?.data || campaignsData?.data?.length === 0) && (
              <div className="text-center py-6 text-xs text-slate-400">No campaigns created yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
