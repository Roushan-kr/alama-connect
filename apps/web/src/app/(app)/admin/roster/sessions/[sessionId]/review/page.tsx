"use client";

import { use, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

interface ConflictItem {
  conflictType:
    | "FIELD_VALUE_CONFLICT"
    | "EMAIL_CONFLICT"
    | "CLAIMED_RECORD"
    | "REMOVED_RECORD"
    | "DUPLICATE_ENTRY_IN_FILE"
    | "DUPLICATE_EMAIL_IN_FILE"
    | "VALIDATION_ERROR";
  field: string | null;
  currentValue: string | null;
  incomingValue: string | null;
  message: string;
}

interface ConflictRow {
  rowIndex: number;
  entryNumber: string | null;
  fullName: string | null;
  email: string | null;
  branch: string | null;
  batch: number | null;
  role: string | null;
  meta: Record<string, any>;
  mergeAction: "NEW" | "UPDATE" | "SKIP";
  conflicts: ConflictItem[];
}

interface ConflictSummary {
  totalRows: number;
  newCount: number;
  updateCount: number;
  skipCount: number;
  errorCount: number;
  conflictCount: number;
  claimedCount: number;
  requiresResolutionCount: number;
  removedCount: number;
  conflictPageCount: number;
  requiresDoubleConfirmation: boolean;
  analysisMs?: number;
  inserted?: number;
  upserted?: number;
  touched?: number;
  flaggedRemoved?: number;
  skipped?: number;
  mergeMs?: number;
}

export default function RosterReviewPage({
  params: paramsPromise,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const params = use(paramsPromise);
  const { sessionId } = params;
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"ALL" | "CONFLICTS" | "ERRORS">("ALL");
  const [page, setPage] = useState(1);
  const [session, setSession] = useState<any>(null);
  const [resolutions, setResolutions] = useState<
    Record<number, "ACCEPT_INCOMING" | "KEEP_EXISTING" | "SKIP_ROW">
  >({});
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Poll Session Status & Fetch Conflicts
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["roster-conflicts", sessionId, filter, page],
    queryFn: () =>
      apiRequest(
        `/api/admin/roster/sessions/${sessionId}/conflicts?filter=${filter}&page=${page}&limit=20`,
        { token: accessToken }
      ),
    enabled: !!accessToken,
    refetchInterval: (query) => {
      const resData = query.state.data;
      const confData = resData?.data || resData;
      const status = confData?.sessionStatus;
      if (status === "ANALYZING" || status === "MAPPED" || status === "PENDING" || status === "SANITIZING") {
        return 2000; // Poll every 2s while analyzing
      }
      return false;
    },
  });

  // Fetch basic session details for filename
  useEffect(() => {
    if (accessToken && sessionId) {
      apiRequest<any>(`/api/admin/roster/sessions/${sessionId}`, { token: accessToken })
        .then((res) => setSession(res?.data || res))
        .catch(console.error);
    }
  }, [accessToken, sessionId]);

  const conflictsData = data?.data || data;
  const summary: ConflictSummary | undefined = conflictsData?.summary;
  const rows: ConflictRow[] = conflictsData?.rows || [];
  const totalConflictRows = conflictsData?.totalConflictRows || 0;
  const sessionStatus = conflictsData?.sessionStatus || session?.status;

  // Save Resolutions Mutation
  const resolveMutation = useMutation({
    mutationFn: (body: {
      resolutions: Array<{
        rowIndex: number;
        decision: "ACCEPT_INCOMING" | "KEEP_EXISTING" | "SKIP_ROW";
      }>;
      confirmRemoval?: boolean;
    }) =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}/conflicts/resolve`, {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: (res) => {
      setSaveSuccessMsg("Decisions saved successfully!");
      setTimeout(() => setSaveSuccessMsg(null), 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["roster-sessions"] });
    },
    onError: (err: any) => {
      alert("Failed to save resolutions: " + err.message);
    },
  });

  // Confirm Merge Mutation
  const confirmMergeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}/confirm`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      alert("Merge initiated in background! You will be redirected to history.");
      router.push("/admin/roster");
    },
    onError: (err: any) => {
      alert("Failed to initiate merge: " + err.message);
    },
  });

  // Cancel Upload Mutation
  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      alert("Upload cancelled successfully.");
      router.push("/admin/roster");
    },
    onError: (err: any) => {
      alert("Failed to cancel upload: " + err.message);
    },
  });

  const handleDecisionChange = (
    rowIndex: number,
    decision: "ACCEPT_INCOMING" | "KEEP_EXISTING" | "SKIP_ROW"
  ) => {
    setResolutions((prev) => ({
      ...prev,
      [rowIndex]: decision,
    }));
  };

  const handleSaveResolutions = () => {
    const payload = Object.entries(resolutions).map(([idx, dec]) => ({
      rowIndex: parseInt(idx, 10),
      decision: dec as "ACCEPT_INCOMING" | "KEEP_EXISTING" | "SKIP_ROW",
    }));
    if (payload.length === 0 && !summary?.requiresDoubleConfirmation) {
      alert("No new resolutions selected.");
      return;
    }
    resolveMutation.mutate({
      resolutions: payload,
      ...(summary?.requiresDoubleConfirmation ? { confirmRemoval } : {}),
    });
  };

  const handleConfirmMerge = () => {
    confirmMergeMutation.mutate();
  };

  if (isLoading || sessionStatus === "ANALYZING" || sessionStatus === "MAPPED" || sessionStatus === "PENDING" || sessionStatus === "SANITIZING") {
    return (
      <div className="flex flex-col h-64 items-center justify-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="text-xs text-slate-500 font-semibold animate-pulse">
          Analyzing roster conflict data... Please wait.
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-center bg-red-50/50 rounded-2xl border border-red-100 max-w-lg mx-auto space-y-3">
        <p className="text-sm font-semibold text-red-800">
          Conflict data has expired or is unavailable.
        </p>
        <p className="text-xs text-slate-500">
          Review datasets are only cached for 48 hours. Please re-save column mappings to regenerate conflicts analysis.
        </p>
        <button
          onClick={() => router.push(`/admin/roster/sessions/${sessionId}/mapping`)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          Re-map Columns
        </button>
      </div>
    );
  }

  if (!conflictsData) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Review Upload — {session?.originalName || "Roster File"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Status:{" "}
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-100">
              {sessionStatus}
            </span>
          </p>
        </div>

        {sessionStatus === "COMPLETE" ? (
          <button
            onClick={() => router.push("/admin/roster")}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
          >
            &larr; Back to Roster History
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="rounded-lg border border-red-200 hover:bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition-all disabled:opacity-50"
            >
              Cancel Upload
            </button>
            <button
              onClick={handleConfirmMerge}
              disabled={
                sessionStatus !== "READY_TO_MERGE" || confirmMergeMutation.isPending
              }
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50"
            >
              Confirm & Execute Merge
            </button>
          </div>
        )}
      </div>

      {/* Complete Status Banner & Results */}
      {sessionStatus === "COMPLETE" && summary && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎉</span>
            <div>
              <h2 className="text-sm font-bold text-emerald-900">Merge Completed Successfully!</h2>
              <p className="text-xs text-emerald-700 mt-0.5">
                The roster data has been successfully integrated into your network database records.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 pt-2">
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Inserted Records</div>
              <div className="mt-1 text-lg font-bold text-emerald-600">+{summary.inserted ?? 0}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Updated Records</div>
              <div className="mt-1 text-lg font-bold text-amber-600">~{summary.upserted ?? 0}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Touched (Kept)</div>
              <div className="mt-1 text-lg font-bold text-indigo-600">{summary.touched ?? 0}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Flagged Removed</div>
              <div className="mt-1 text-lg font-bold text-red-600">{summary.flaggedRemoved ?? 0}</div>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 flex justify-between items-center pt-2">
            <span>Execution Duration: {summary.mergeMs ? `${(summary.mergeMs / 1000).toFixed(2)}s` : "N/A"}</span>
            <span>Skipped Rows: {summary.skipped ?? 0}</span>
          </div>
        </div>
      )}

      {/* Stats Cards (Active only if not complete) */}
      {sessionStatus !== "COMPLETE" && summary && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Rows</div>
            <div className="mt-1 text-lg font-bold text-slate-900">{summary.totalRows}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">New Records</div>
            <div className="mt-1 text-lg font-bold text-emerald-600">{summary.newCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-500">Updates</div>
            <div className="mt-1 text-lg font-bold text-amber-600">{summary.updateCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-red-500">Validation Errors</div>
            <div className="mt-1 text-lg font-bold text-red-600">{summary.errorCount}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Conflicts</div>
            <div className="mt-1 text-lg font-bold text-indigo-600">{summary.conflictCount}</div>
          </div>
        </div>
      )}

      {/* Double Confirmation Warning Bar */}
      {sessionStatus !== "COMPLETE" && summary?.requiresDoubleConfirmation && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3 max-w-3xl">
          <div className="flex items-start gap-2.5">
            <span className="text-red-700 text-lg">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-red-900">Critical Removal Threshold Warning</h3>
              <p className="text-xs text-red-700 mt-0.5">
                Executing this merge will mark{" "}
                <span className="font-bold">{summary?.removedCount} students</span> as removed (they
                exist in the system but are missing from this sheet). This represents more than 30%
                of the active roster.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer bg-white border border-red-100 px-3 py-2 rounded-lg text-xs font-semibold text-red-800 hover:bg-slate-50 transition-all select-none">
            <input
              type="checkbox"
              checked={confirmRemoval}
              onChange={(e) => setConfirmRemoval(e.target.checked)}
              className="text-red-600 focus:ring-red-500 rounded border-slate-300"
            />
            I confirm that I want to mark these {summary?.removedCount} records as removed from the active roster.
          </label>
        </div>
      )}

      {/* Conflicts & Resolutions Console */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            {(["ALL", "CONFLICTS", "ERRORS"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setFilter(t);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  filter === t
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t === "ALL" ? "All Issues" : t === "CONFLICTS" ? "Conflicts" : "Errors"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {saveSuccessMsg && (
              <span className="text-xs font-bold text-emerald-600 animate-fade-in">
                {saveSuccessMsg}
              </span>
            )}
            <button
              onClick={handleSaveResolutions}
              disabled={
                resolveMutation.isPending ||
                (Object.keys(resolutions).length === 0 && !summary?.requiresDoubleConfirmation)
              }
              className="rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
            >
              {resolveMutation.isPending ? "Saving..." : "Save Conflict Resolutions"}
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-2xl">✅</div>
            <p className="text-sm font-semibold text-emerald-700">
              {filter === "ALL"
                ? "No conflicts detected — this upload is clean and ready to merge."
                : "No rows match this filter."}
            </p>
            <p className="text-xs text-slate-400">
              {filter === "ALL" ? "Click \"Confirm & Execute Merge\" above to proceed." : "Try switching to \"All Issues\" to see all rows."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400">
                  <th className="px-6 py-4">Row #</th>
                  <th className="px-6 py-4">Entry Number</th>
                  <th className="px-6 py-4">Full Name</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Conflicts Detected</th>
                  <th className="px-6 py-4 text-right">Resolution Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {rows.map((row) => {
                  const hasValError = row.conflicts.some((c) => c.conflictType === "VALIDATION_ERROR");
                  const hasDupInFile = row.conflicts.some((c) => c.conflictType === "DUPLICATE_ENTRY_IN_FILE");
                  const isBlocked = hasValError || hasDupInFile;

                  const currentDecision = resolutions[row.rowIndex] || "ACCEPT_INCOMING";

                  return (
                    <tr key={row.rowIndex} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 font-mono text-slate-400">{row.rowIndex}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {row.entryNumber || <span className="text-red-500 font-bold">Missing</span>}
                      </td>
                      <td className="px-6 py-4">{row.fullName || "—"}</td>
                      <td className="px-6 py-4 font-medium text-slate-600">{row.role || "—"}</td>
                      <td className="px-6 py-4 space-y-1">
                        {row.conflicts.map((conf, cIdx) => (
                          <div key={cIdx} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                conf.conflictType === "VALIDATION_ERROR" ||
                                conf.conflictType === "DUPLICATE_ENTRY_IN_FILE"
                                  ? "bg-red-50 text-red-700 border border-red-100"
                                  : "bg-amber-50 text-amber-700 border border-amber-100"
                              }`}
                            >
                              {conf.conflictType}
                            </span>
                            <span>{conf.message}</span>
                          </div>
                        ))}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isBlocked ? (
                          <span className="text-red-600 font-bold text-[10px] uppercase">
                            Auto-Skipped
                          </span>
                        ) : (
                          <select
                            value={currentDecision}
                            onChange={(e) =>
                              handleDecisionChange(
                                row.rowIndex,
                                e.target.value as any
                              )
                            }
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
                          >
                            <option value="ACCEPT_INCOMING">Accept Incoming Excel fields</option>
                            <option value="KEEP_EXISTING">Keep Existing database record</option>
                            <option value="SKIP_ROW">Skip updating this row</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalConflictRows > 20 && (
          <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, totalConflictRows)} of{" "}
              {totalConflictRows} conflict rows
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 20 >= totalConflictRows}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
