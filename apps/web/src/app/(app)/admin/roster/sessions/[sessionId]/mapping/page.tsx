"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";

interface MappingItem {
  excelHeader: string;
  templateVar: string;
  isCoreField: boolean;
  coreField: string;
}

export default function RosterMappingPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const { accessToken } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Poll status: fetch session details
  const { data: sessionData, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["roster-session", sessionId],
    queryFn: () =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}`, {
        token: accessToken,
      }),
    enabled: !!accessToken && !!sessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "PENDING" || status === "SANITIZING" || status === "MERGING" ? 1500 : false;
    },
  });

  const session = sessionData?.data;

  // Auto-fill or sync mappings
  useEffect(() => {
    if (session?.status === "SANITIZED" && session?.mergeSummary?.detectedHeaders) {
      const headers = session.mergeSummary.detectedHeaders;
      const initial = headers.map((header: string) => {
        const lower = header.toLowerCase().replace(/[\s_-]+/g, "");
        let coreField = "";
        let isCoreField = false;

        if (lower === "entryno" || lower === "entrynumber" || lower === "rollno" || lower === "rollnumber") {
          coreField = "entryNumber";
          isCoreField = true;
        } else if (lower === "name" || lower === "fullname" || lower === "studentname") {
          coreField = "fullName";
          isCoreField = true;
        } else if (lower === "email" || lower === "emailaddress") {
          coreField = "email";
          isCoreField = true;
        } else if (lower === "branch" || lower === "department") {
          coreField = "branch";
          isCoreField = true;
        } else if (lower === "batch" || lower === "year") {
          coreField = "batch";
          isCoreField = true;
        } else if (lower === "role" || lower === "type") {
          coreField = "role";
          isCoreField = true;
        }

        const templateVar = header
          .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
          .replace(/[^a-zA-Z0-9]/g, "")
          .replace(/^[A-Z]/, (c) => c.toLowerCase());

        return {
          excelHeader: header,
          templateVar: templateVar || "field",
          isCoreField,
          coreField,
        };
      });
      setMappings(initial);
    } else if (session?.columnMappings && session.columnMappings.length > 0) {
      setMappings(
        session.columnMappings.map((m: any) => ({
          excelHeader: m.excelHeader,
          templateVar: m.templateVar,
          isCoreField: m.isCoreField,
          coreField: m.coreField || "",
        }))
      );
    }
  }, [session]);

  const saveMappingsMutation = useMutation({
    mutationFn: (mappingsData: any[]) =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}/mappings`, {
        method: "POST",
        body: { mappings: mappingsData },
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-session", sessionId] });
      setSaveError(null);
      alert("Mappings saved successfully!");
    },
    onError: (err: any) => {
      setSaveError(err.message || "Failed to save column mappings");
    },
  });

  const confirmMergeMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/roster/sessions/${sessionId}/confirm`, {
        method: "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-session", sessionId] });
      alert("Roster merge process initiated!");
    },
    onError: (err: any) => {
      alert("Failed to confirm merge: " + err.message);
    },
  });

  const handleFieldChange = (index: number, key: keyof MappingItem, value: any) => {
    const next = [...mappings];
    next[index] = { ...next[index], [key]: value } as MappingItem;
    setMappings(next);
  };

  const handleSave = () => {
    const formatted = mappings.map((m) => ({
      excelHeader: m.excelHeader,
      templateVar: m.templateVar,
      isCoreField: m.isCoreField,
      ...(m.isCoreField && m.coreField ? { coreField: m.coreField } : {}),
    }));
    saveMappingsMutation.mutate(formatted);
  };

  // Check if entryNumber mapping is set
  const hasEntryNumber = mappings.some((m) => m.isCoreField && m.coreField === "entryNumber");

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-xs text-red-700 space-y-4">
        <div>Session not found or authorization failed.</div>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 font-bold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isLoading || !session) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 rounded-2xl bg-white border border-slate-200" />
        <div className="h-40 rounded-2xl bg-white border border-slate-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Session Title Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Roster Import Session</h1>
          <p className="text-xs text-slate-500 mt-1">
            File: <span className="font-semibold text-slate-700">{session.originalName}</span> &bull; Status:{" "}
            <span className="font-extrabold text-brand-600 uppercase">{session.status}</span>
          </p>
        </div>

        {session.status === "MAPPED" && (
          <button
            onClick={() => confirmMergeMutation.mutate()}
            disabled={confirmMergeMutation.isPending}
            className="rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-2.5 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
          >
            {confirmMergeMutation.isPending ? "Starting Merge..." : "Confirm & Merge Roster"}
          </button>
        )}
      </div>

      {/* Merge / Sanitization Summary */}
      {session.mergeSummary && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Merge / Sanitization Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Rows</span>
              <span className="text-lg font-extrabold text-slate-900">{session.mergeSummary.totalRows || 0}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Clean Rows</span>
              <span className="text-lg font-extrabold text-slate-900">
                {session.mergeSummary.cleanRows ?? session.mergeSummary.inserted ?? 0}
              </span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Sanitization Errors</span>
              <span className="text-lg font-extrabold text-slate-900">{session.mergeSummary.errorCount || 0}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 block uppercase">Flagged Removed</span>
              <span className="text-lg font-extrabold text-slate-900">{session.mergeSummary.flaggedRemoved || 0}</span>
            </div>
          </div>

          {session.mergeSummary.errors && session.mergeSummary.errors.length > 0 && (
            <div className="mt-4 border border-red-100 rounded-xl bg-red-50/50 p-4 space-y-2">
              <h3 className="text-xs font-bold text-red-800">Errors Preview (First 100 rows):</h3>
              <div className="max-h-40 overflow-y-auto text-[10px] font-mono text-red-700 divide-y divide-red-100/50">
                {session.mergeSummary.errors.map((err: any, idx: number) => (
                  <div key={idx} className="py-1">
                    Row {err.rowIndex}: Column &ldquo;{err.columnName}&rdquo; - {err.reason} (Value: &ldquo;{err.value}&rdquo;)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mapping Configuration */}
      {(session.status === "SANITIZED" || session.status === "MAPPED") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Map Columns to Schema</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Review raw column mapping. You must map the required <strong>Entry Number</strong> field to merge records.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                  <th className="pb-3">Excel Header</th>
                  <th className="pb-3">Template Variable</th>
                  <th className="pb-3">Field Type</th>
                  <th className="pb-3">Structured Target Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                {mappings.map((mapping, idx) => (
                  <tr key={idx}>
                    <td className="py-3 font-semibold text-slate-900">{mapping.excelHeader}</td>
                    <td className="py-3">
                      <input
                        type="text"
                        value={mapping.templateVar}
                        onChange={(e) => handleFieldChange(idx, "templateVar", e.target.value)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 outline-none w-40 font-mono"
                      />
                    </td>
                    <td className="py-3">
                      <select
                        value={mapping.isCoreField ? "core" : "meta"}
                        onChange={(e) => {
                          const isCore = e.target.value === "core";
                          handleFieldChange(idx, "isCoreField", isCore);
                          if (!isCore) handleFieldChange(idx, "coreField", "");
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
                      >
                        <option value="meta">Custom Metadata (meta)</option>
                        <option value="core">Structured Field (core)</option>
                      </select>
                    </td>
                    <td className="py-3">
                      {mapping.isCoreField ? (
                        <select
                          value={mapping.coreField}
                          onChange={(e) => handleFieldChange(idx, "coreField", e.target.value)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 bg-white outline-none focus:border-brand-500"
                        >
                          <option value="">-- Choose Field --</option>
                          <option value="entryNumber">Entry Number (Required)</option>
                          <option value="fullName">Full Name</option>
                          <option value="email">Email</option>
                          <option value="branch">Branch</option>
                          <option value="batch">Batch Year</option>
                          <option value="role">Role (STUDENT, ALUMNI, FACULTY)</option>
                        </select>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Meta payload</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {saveError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">
              {saveError}
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-slate-100">
            <span className="text-[10px] text-slate-400">
              {!hasEntryNumber && (
                <span className="text-red-500 font-semibold">⚠️ Entry Number mapping is required to enable merge</span>
              )}
            </span>

            <button
              onClick={handleSave}
              disabled={saveMappingsMutation.isPending}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-xs font-bold text-white transition-all disabled:opacity-50"
            >
              {saveMappingsMutation.isPending ? "Saving..." : "Save Column Mappings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
