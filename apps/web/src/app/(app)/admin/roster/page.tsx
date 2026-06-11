"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest, API_BASE } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";

export default function RosterPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadSample = () => {
    window.open("https://pub-0631336b69ec44dc9b5dbe8c61843614.r2.dev/sample-roster.xlsx", "_blank");
  };

  // Trigger merge confirmation mutation
  const triggerMergeMutation = useMutation({
    mutationFn: (sessId: string) =>
      apiRequest(`/api/admin/roster/sessions/${sessId}/confirm`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      alert("Merge triggered successfully!");
      queryClient.invalidateQueries({ queryKey: ["roster-sessions", networkId] });
    },
    onError: (err: any) => {
      alert("Failed to trigger merge: " + err.message);
    },
  });

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
  useEffect(() => {
    if (adminNetworks.length > 0 && !networkId) {
      setNetworkId(adminNetworks[0].networkId);
    }
  }, [adminNetworks, networkId]);

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

      const res = await fetch(`${API_BASE}/api/admin/roster/upload?networkId=${networkId}`, {
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
      setUploadStatus("Excel uploaded! Redirecting to column mapping...");
      setSessionId(data.data.sessionId);
      queryClient.invalidateQueries({ queryKey: ["roster-sessions", networkId] });
      router.push(`/admin/roster/sessions/${data.data.sessionId}/mapping`);
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

        {adminNetworks.length > 0 && (
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

        <div className="mt-6">
          <button
            type="button"
            onClick={handleDownloadSample}
            className="rounded-xl border border-brand-200 bg-brand-50/20 hover:bg-brand-50 px-4 py-2 text-xs font-bold text-brand-600 flex items-center gap-1.5 transition-all"
          >
            <span>📥</span>
            Download sample file
          </button>
        </div>

        <form onSubmit={handleUpload} className="mt-4 space-y-4 max-w-md">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDragActive ? "border-brand-500 bg-brand-50/20" : "border-slate-200 hover:border-brand-500"
            }`}
          >
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
              <div className="text-[10px] text-slate-400">Supported formats: XLSX, XLS, CSV (Max 10MB)</div>
            </label>
          </div>

          {uploadStatus && (
            <div className="text-xs font-semibold p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700">
              {uploadStatus}
            </div>
          )}

          {sessionId && (
            <Link
              href={`/admin/roster/sessions/${sessionId}/mapping`}
              className="inline-block text-xs font-bold text-brand-600 hover:text-brand-700 underline"
            >
              View Sanitization Status & Mappings &rarr;
            </Link>
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
                <th className="pb-3">Records</th>
                <th className="pb-3">Uploaded At</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
              {(Array.isArray(sessionsData) ? sessionsData : sessionsData?.data)?.map((session: any) => {
                let badgeClass = "bg-slate-50 text-slate-700 border-slate-100";
                if (session.status === "COMPLETE") {
                  badgeClass = "bg-green-50 text-green-700 border-green-100";
                } else if (session.status === "FAILED") {
                  badgeClass = "bg-red-50 text-red-700 border-red-100";
                } else if (session.status === "MAPPED") {
                  badgeClass = "bg-purple-50 text-purple-700 border-purple-100";
                } else if (session.status === "SANITIZED") {
                  badgeClass = "bg-blue-50 text-blue-700 border-blue-100";
                } else if (
                  session.status === "SANITIZING" ||
                  session.status === "MERGING" ||
                  session.status === "PENDING"
                ) {
                  badgeClass = "bg-amber-50 text-amber-700 border-amber-100";
                }

                const recordsCount =
                  session.mergeSummary?.total ??
                  session.mergeSummary?.totalRows ??
                  session.mergeSummary?.inserted ??
                  0;

                return (
                  <tr key={session.sessionId}>
                    <td className="py-3 font-mono text-[10px] text-slate-400">{session.sessionId}</td>
                    <td className="py-3 font-medium">{session.originalName}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-slate-600">{recordsCount}</td>
                    <td className="py-3">{new Date(session.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right space-x-3">
                      {["CONFLICT_REVIEW", "READY_TO_MERGE"].includes(session.status) ? (
                        <Link
                          href={`/admin/roster/sessions/${session.sessionId}/review`}
                          className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline"
                        >
                          Review conflicts
                        </Link>
                      ) : (
                        <Link
                          href={`/admin/roster/sessions/${session.sessionId}/mapping`}
                          className="text-brand-600 hover:text-brand-700 font-bold hover:underline"
                        >
                          View mapping
                        </Link>
                      )}
                      {session.status === "MAPPED" && (
                        <button
                          onClick={() => triggerMergeMutation.mutate(session.sessionId)}
                          disabled={triggerMergeMutation.isPending}
                          className="rounded-lg bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-all"
                        >
                          Re-trigger merge
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!sessionsData || (Array.isArray(sessionsData) ? sessionsData : sessionsData?.data)?.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
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
