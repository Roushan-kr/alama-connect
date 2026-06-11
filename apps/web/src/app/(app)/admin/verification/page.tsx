"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import { useAdminNetwork } from "@/contexts/adminNetwork";

interface VerificationRequest {
  reqId: string;
  userId: string;
  method: "ENTRY_NUMBER" | "DOCUMENT_UPLOAD";
  entryNumber: string | null;
  documentUrl: string | null;
  status: "PENDING" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED";
  submittedAt: string;
  user: {
    email: string;
    username: string;
  };
  profile: {
    fullName: string | null;
  } | null;
}

export default function VerificationQueuePage() {
  const { networkId, isLoading: networkLoading } = useAdminNetwork();
  const { accessToken } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"PENDING" | "UNDER_REVIEW" | "DECIDED">("PENDING");
  const [rejectingReqId, setRejectingReqId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [notes, setNotes] = useState("");

  // Guard: redirect if not admin of any network
  useEffect(() => {
    if (!networkLoading && !networkId) {
      router.push("/feed");
    }
  }, [networkId, networkLoading, router]);

  // Fetch Verification Requests
  const { data, isLoading, isError, refetch } = useQuery<{
    data: VerificationRequest[];
    nextCursor: string | null;
  }>({
    queryKey: ["verification-queue", networkId, activeTab],
    queryFn: () =>
      apiRequest(`/api/verification/admin/pending?networkId=${networkId}&status=${activeTab}`, {
        token: accessToken,
      }),
    enabled: !!accessToken && !!networkId,
  });

  const requests = data?.data || [];

  // Approve Request Mutation
  const approveMutation = useMutation({
    mutationFn: ({ reqId, notes }: { reqId: string; notes?: string }) =>
      apiRequest(`/api/verification/admin/${reqId}/approve`, {
        method: "POST",
        token: accessToken,
        body: { notes },
      }),
    onMutate: async ({ reqId }) => {
      await queryClient.cancelQueries({ queryKey: ["verification-queue", networkId, activeTab] });
      const previous = queryClient.getQueryData(["verification-queue", networkId, activeTab]);
      queryClient.setQueryData(["verification-queue", networkId, activeTab], (old: any) => ({
        ...old,
        data: old?.data?.filter((r: any) => r.reqId !== reqId) || [],
      }));
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["verification-queue", networkId, activeTab], context.previous);
      }
      alert("Failed to approve verification request: " + err.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verification-queue", networkId, activeTab] });
    },
  });

  // Reject Request Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ reqId, reason }: { reqId: string; reason: string }) =>
      apiRequest(`/api/verification/admin/${reqId}/reject`, {
        method: "POST",
        token: accessToken,
        body: { reason },
      }),
    onMutate: async ({ reqId }) => {
      await queryClient.cancelQueries({ queryKey: ["verification-queue", networkId, activeTab] });
      const previous = queryClient.getQueryData(["verification-queue", networkId, activeTab]);
      queryClient.setQueryData(["verification-queue", networkId, activeTab], (old: any) => ({
        ...old,
        data: old?.data?.filter((r: any) => r.reqId !== reqId) || [],
      }));
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["verification-queue", networkId, activeTab], context.previous);
      }
      alert("Failed to reject verification request: " + err.message);
    },
    onSuccess: () => {
      setRejectingReqId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["verification-queue", networkId, activeTab] });
    },
  });

  // Handle document URL fetching
  const handleViewDocument = async (reqId: string) => {
    try {
      const res = await apiRequest<{ url: string }>(`/api/verification/admin/${reqId}/document-url`, {
        token: accessToken,
      });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      alert("Failed to get document URL: " + err.message);
    }
  };

  if (networkLoading || (!networkId && !networkLoading)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Verification Queue</h1>
          <p className="text-sm text-slate-500">
            Review roster match and uploaded document verification submissions.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 shadow-sm max-w-md">
        {(["PENDING", "UNDER_REVIEW", "DECIDED"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2.5 text-xs font-bold transition-all ${
              activeTab === tab
                ? "bg-brand-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab === "PENDING"
              ? "Pending"
              : tab === "UNDER_REVIEW"
              ? "Under Review"
              : "Decided"}
          </button>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {isError ? (
          <div className="p-8 text-center space-y-4">
            <div className="text-sm text-red-500 font-semibold">Failed to load verification requests.</div>
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
              <div key={n} className="p-6 space-y-3 animate-pulse">
                <div className="flex justify-between items-center">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-6 w-16 rounded-full bg-slate-200" />
                </div>
                <div className="h-3 w-48 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No verification requests found in this tab.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] uppercase font-bold text-slate-400">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">Submitted</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {requests.map((req) => (
                  <tr key={req.reqId} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {req.profile?.fullName || req.user.username}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{req.user.email}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          req.method === "ENTRY_NUMBER"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        {req.method === "ENTRY_NUMBER" ? "Entry Number" : "Document"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {new Date(req.submittedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {req.method === "DOCUMENT_UPLOAD" && (
                        <button
                          onClick={() => handleViewDocument(req.reqId)}
                          className="text-brand-600 hover:text-brand-700 font-bold hover:underline"
                        >
                          View Document
                        </button>
                      )}

                      {activeTab !== "DECIDED" && (
                        <>
                          <button
                            onClick={() => {
                              const notesInput = prompt("Optional notes for approval:");
                              approveMutation.mutate({ reqId: req.reqId, notes: notesInput || "" });
                            }}
                            disabled={approveMutation.isPending}
                            className="rounded-lg bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-all"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectingReqId(req.reqId)}
                            className="rounded-lg bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 transition-all"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {activeTab === "DECIDED" && (
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            req.status === "VERIFIED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {req.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline Reject Modal */}
      {rejectingReqId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Reject Verification Request</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Provide a reason for rejecting this verification request. This note will be sent to the user.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                Rejection Reason
              </label>
              <textarea
                placeholder="Documents did not match student roster or are illegible."
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectingReqId(null);
                  setRejectReason("");
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectMutation.mutate({ reqId: rejectingReqId, reason: rejectReason })}
                disabled={rejectMutation.isPending || !rejectReason.trim()}
                className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white shadow transition-all disabled:opacity-50"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
