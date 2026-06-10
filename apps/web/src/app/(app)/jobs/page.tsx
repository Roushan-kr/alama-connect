"use client";

import { useState, useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";

interface Job {
  jobId: string;
  contentId: string;
  title: string;
  description: string;
  location: string;
  applyLink: string;
  tags: string[];
  expiresAt: string | null;
  createdAt: string;
  poster: {
    userId: string;
    username: string;
    profile?: {
      fullName: string | null;
      profileImage: string | null;
    } | null;
  };
}

interface JobsResponse {
  data: Job[];
  meta: {
    nextCursor: string | null;
    nextCursorId: string | null;
    hasMore: boolean;
    limit: number;
  };
}

interface ProfileResponse {
  userId: string;
  networkMemberships: Array<{
    networkId: string;
    status: string;
    role: string;
    network: { name: string; code: string };
  }>;
}

export default function JobsPage() {
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [showPostModal, setShowPostModal] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDesc, setNewJobDesc] = useState("");
  const [newJobLoc, setNewJobLoc] = useState("");
  const [newJobLink, setNewJobLink] = useState("");
  const [newJobTagsString, setNewJobTagsString] = useState("");
  const [newJobExpires, setNewJobExpires] = useState("");
  const [postError, setPostError] = useState<string | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);

  // Fetch current user's profile to extract network memberships
  const { data: profile } = useQuery<ProfileResponse>({
    queryKey: ["profile", user?.userId],
    queryFn: () => apiRequest<ProfileResponse>("/api/users/me", { token: accessToken }),
    enabled: !!accessToken && !!user?.userId,
  });

  // Get first verified network membership
  const verifiedMembership = profile?.networkMemberships.find((m) => m.status === "VERIFIED");
  const networkId = verifiedMembership?.networkId;
  const isVerified = !!verifiedMembership;

  // Infinite query for jobs
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery<JobsResponse>({
    queryKey: ["jobs", networkId, selectedTags],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (networkId) params.append("networkId", networkId);
      selectedTags.forEach((t) => params.append("tags", t));
      if (pageParam) {
        const parts = (pageParam as string).split("|");
        const cCursor = parts[0];
        const cId = parts[1];
        if (cCursor) params.append("cursor", cCursor);
        if (cId) params.append("cursorId", cId);
      }
      return apiRequest<JobsResponse>(`/api/jobs?${params.toString()}`, { token: accessToken });
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.meta.nextCursor && lastPage.meta.nextCursorId) {
        return `${lastPage.meta.nextCursor}|${lastPage.meta.nextCursorId}`;
      }
      return undefined;
    },
    enabled: !!accessToken && !!networkId,
  });

  // Infinite Scroll Trigger
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { threshold: 0.8 }
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }
    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Create job posting mutation
  const createJobMutation = useMutation({
    mutationFn: (newJob: any) =>
      apiRequest("/api/jobs", {
        method: "POST",
        token: accessToken,
        body: {
          networkId,
          ...newJob,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setShowPostModal(false);
      // Reset form
      setNewJobTitle("");
      setNewJobDesc("");
      setNewJobLoc("");
      setNewJobLink("");
      setNewJobTagsString("");
      setNewJobExpires("");
      setPostError(null);
    },
    onError: (err: any) => {
      setPostError(err.message || "Failed to create job posting");
    },
  });

  const handlePostJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle || !newJobDesc || !newJobLoc) {
      setPostError("Please fill out all required fields");
      return;
    }

    const tags = newJobTagsString
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    createJobMutation.mutate({
      title: newJobTitle,
      description: newJobDesc,
      location: newJobLoc,
      applyLink: newJobLink,
      tags,
      expiresAt: newJobExpires ? new Date(newJobExpires).toISOString() : undefined,
    });
  };

  // Extract jobs from all pages and apply local location filter
  const allJobs = data?.pages.flatMap((page) => page.data) || [];
  const filteredJobs = allJobs.filter((job) =>
    job.location.toLowerCase().includes(locationQuery.toLowerCase()) ||
    job.title.toLowerCase().includes(locationQuery.toLowerCase()) ||
    job.description.toLowerCase().includes(locationQuery.toLowerCase())
  );

  // Predefined popular chips
  const popularTags = ["React", "Node.js", "Python", "Full-time", "Internship", "Remote", "Engineering"];

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="space-y-6">
      {/* Title & Post Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Job Board</h1>
          <p className="text-slate-500 mt-1">Discover opportunities within the verified university network</p>
        </div>
        {isVerified && (
          <button
            onClick={() => setShowPostModal(true)}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            Post a Job
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Search Opportunities</label>
          <input
            type="text"
            placeholder="Search by title, description or location..."
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
          />
        </div>
        
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Filter by tags</span>
          <div className="flex flex-wrap gap-2">
            {popularTags.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Job Postings Grid/List */}
      {status === "pending" ? (
        <div className="text-center py-12 text-slate-400">Loading listings...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-slate-500 bg-slate-50">
          No job postings found for the selected criteria.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <div key={job.jobId} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-300 transition duration-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900">{job.title}</h2>
                  {job.expiresAt && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wider">
                      Expires: {new Date(job.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>📍 {job.location}</span>
                  <span>👤 Posted by @{job.poster.username}</span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 max-w-2xl">{job.description}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {job.tags.map((t) => (
                    <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {job.applyLink && (
                <a
                  href={job.applyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full md:w-auto rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  Apply
                </a>
              )}
            </div>
          ))}

          {/* Sentinel for infinite scroll */}
          <div ref={observerTarget} className="h-4" />

          {isFetchingNextPage && (
            <div className="text-center py-4 text-slate-400 text-xs animate-pulse">Loading older posts...</div>
          )}
        </div>
      )}

      {/* Post Job Modal */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-150 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-bold text-slate-950">Post a Job Opening</h2>
            <p className="text-xs text-slate-500 mt-1">Post a new role visible to all members of your university</p>

            <form onSubmit={handlePostJob} className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Job Title *
                <input
                  type="text"
                  required
                  placeholder="e.g. Frontend Software Engineer"
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Job Description *
                <textarea
                  required
                  rows={4}
                  placeholder="Responsibilities, experience criteria, etc..."
                  value={newJobDesc}
                  onChange={(e) => setNewJobDesc(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-slate-700">
                  Location *
                  <input
                    type="text"
                    required
                    placeholder="e.g. Remote, San Francisco"
                    value={newJobLoc}
                    onChange={(e) => setNewJobLoc(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Application Link
                  <input
                    type="text"
                    placeholder="e.g. https://careers.company.com/role"
                    value={newJobLink}
                    onChange={(e) => setNewJobLink(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm font-medium text-slate-700">
                  Tags (comma-separated)
                  <input
                    type="text"
                    placeholder="React, Remote, Internship"
                    value={newJobTagsString}
                    onChange={(e) => setNewJobTagsString(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Expiration Date
                  <input
                    type="date"
                    value={newJobExpires}
                    onChange={(e) => setNewJobExpires(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </label>
              </div>

              {postError && <p className="text-xs text-red-600">{postError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createJobMutation.isPending}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition"
                >
                  {createJobMutation.isPending ? "Posting..." : "Post Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
