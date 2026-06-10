"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export default function RosterPage() {
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Load user profile to identify networks
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me-roster"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  });

  const adminNetworks = profile?.networkMemberships?.filter(
    (m: any) => m.role === "ADMIN" && m.status === "VERIFIED"
  ) || [];

  // Set default networkId
  if (adminNetworks.length > 0 && !networkId) {
    setNetworkId(adminNetworks[0].networkId);
  }

  // Fetch session history
  const { data: sessionsData } = useQuery<any>({
    queryKey: ["roster-sessions", networkId],
    queryFn: () =>
      apiRequest(`/api/admin/roster/sessions?networkId=${networkId}`, {
        token: accessToken,
      }),
    enabled: !!accessToken && !!networkId,
  });

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, networkId }: { file: File; networkId: string }) => {
      const formData = new FormData();
      formData.append("networkId", networkId);
      formData.append("file", file);

      const res = await fetch("/api/admin/roster/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setUploadStatus("Excel uploaded successfully! Sanitizing...");
      setSessionId(data.data.sessionId);
      queryClient.invalidateQueries({ queryKey: ["roster-sessions", networkId] });
    },
    onError: (err: any) => {
      setUploadStatus(`Error: ${err.message}`);
    },
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !networkId) return;
    setUploadStatus("Uploading...");
    uploadMutation.mutate({ file, networkId });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Institutional Roster Upload</h1>
        <p className="text-xs text-slate-500 mt-1">
          Upload campus roster (.xlsx, .xls, .csv) up to 10MB (max 50,000 rows).
        </p>

        {adminNetworks.length > 1 && (
          <div className="mt-4">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Select Network
            </label>
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

        <form onSubmit={handleUpload} className="mt-6 space-y-4 max-w-md">
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-brand-500 transition-colors">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              className="hidden"
              id="roster-file-input"
            />
            <label htmlFor="roster-file-input" className="cursor-pointer space-y-2 block">
              <div className="text-slate-400 text-3xl">📁</div>
              <div className="text-sm font-semibold text-slate-700">
                {file ? file.name : "Select or drag Excel/CSV file"}
              </div>
              <div className="text-[10px] text-slate-400">Supported formats: XLSX, XLS, CSV</div>
            </label>
          </div>

          {uploadStatus && (
            <div className="text-xs font-semibold p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700">
              {uploadStatus}
            </div>
          )}

          {sessionId && (
            <a
              href={`/admin/roster/sessions/${sessionId}`}
              className="inline-block text-xs font-bold text-brand-600 hover:text-brand-700 underline"
            >
              View Sanitization Status & Mappings &rarr;
            </a>
          )}

          <button
            type="submit"
            disabled={uploadMutation.isPending}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 py-3 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Roster"}
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Roster Upload History</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                <th className="pb-3">Session ID</th>
                <th className="pb-3">Original Name</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Uploaded At</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
              {sessionsData?.data?.map((session: any) => (
                <tr key={session.sessionId}>
                  <td className="py-3 font-mono text-[10px] text-slate-400">{session.sessionId}</td>
                  <td className="py-3 font-medium">{session.originalName}</td>
                  <td className="py-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        session.status === "COMPLETE"
                          ? "bg-emerald-50 text-emerald-700"
                          : session.status === "FAILED"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {session.status}
                    </span>
                  </td>
                  <td className="py-3">{new Date(session.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 text-right">
                    <a
                      href={`/admin/roster/sessions/${session.sessionId}`}
                      className="text-brand-600 hover:text-brand-700 font-bold hover:underline"
                    >
                      Manage
                    </a>
                  </td>
                </tr>
              ))}
              {(!sessionsData?.data || sessionsData?.data?.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No sessions found. Upload your first roster above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
