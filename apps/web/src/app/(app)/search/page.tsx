"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { apiRequest } from "@/lib/api-client"
import { useAuthStore } from "@/store/auth"
import Link from "next/link"

interface SearchResultItem {
  id: string
  type: "user" | "content" | "job"
  title?: string | null
  body?: string | null
  createdAt: string
  rank: number
  metadata: Record<string, any>
}

interface SearchResponse {
  data: SearchResultItem[]
  nextCursor?: string
}

export default function SearchPage() {
  const { accessToken } = useAuthStore()
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [selectedType, setSelectedType] = useState<"all" | "users" | "content" | "jobs">("all")
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(null)
  const [userNetworks, setUserNetworks] = useState<any[]>([])

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q)
    }, 400)
    return () => clearTimeout(timer)
  }, [q])

  // Load user profile & networks
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  })

  useEffect(() => {
    if (profile?.networkMemberships) {
      setUserNetworks(profile.networkMemberships)
      if (profile.networkMemberships.length > 0 && !selectedNetworkId) {
        setSelectedNetworkId(profile.networkMemberships[0].networkId)
      }
    }
  }, [profile, selectedNetworkId])

  // Fetch search results
  // Fetch search results
  const { data, isLoading, error } = useQuery<SearchResponse>({
    queryKey: ["search", debouncedQ, selectedType, selectedNetworkId],
    queryFn: () =>
      apiRequest<SearchResponse>(
        `/api/search?q=${encodeURIComponent(debouncedQ)}&networkId=${selectedNetworkId}&type=${selectedType}&limit=30`,
        { token: accessToken },
      ),
    enabled: !!accessToken && debouncedQ.length >= 2 && !!selectedNetworkId,
  })

  const searchResults: SearchResultItem[] = Array.isArray(data) ? data : (data as any)?.data || []

  const currentNetworkName =
    userNetworks.find((n) => n.networkId === selectedNetworkId)?.network?.name || "your network"

  return (
    <div className="space-y-8">
      {/* Search Header and Input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">Universal Search</h1>
        <p className="text-sm text-slate-500 mb-6">
          Find peers, conversations, social posts, or career opportunities inside{" "}
          {currentNetworkName}.
        </p>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Type keywords (e.g. name, skill, job title, topic)..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-11 pr-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <div className="absolute left-4 top-3.5 text-slate-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Network Selector (if user has multiple) */}
          {userNetworks.length > 1 && (
            <div className="w-full md:w-64">
              <select
                value={selectedNetworkId || ""}
                onChange={(e) => setSelectedNetworkId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 bg-white outline-none focus:border-brand-500"
              >
                {userNetworks.map((net) => (
                  <option key={net.networkId} value={net.networkId}>
                    {net.network?.name || net.networkId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {(["all", "users", "content", "jobs"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                selectedType === type
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Results View */}
      <div className="space-y-4">
        {debouncedQ.length < 2 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-slate-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-sm font-semibold text-slate-800">Enter Search Keywords</h3>
            <p className="text-xs text-slate-500 mt-1">
              Type at least 2 characters to search the university database.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-28 w-full animate-pulse rounded-2xl bg-white border border-slate-200"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center text-red-700">
            <p className="text-sm font-semibold">Search failed</p>
            <p className="text-xs mt-1">
              Make sure you are connected to the network and try again.
            </p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <h3 className="text-sm font-semibold text-slate-800">No results found</h3>
            <p className="text-xs text-slate-500 mt-1">
              No matching records found for "{debouncedQ}" under the chosen criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {searchResults.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 max-w-2xl">
                  {/* Category Indicator */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                        item.type === "user"
                          ? "bg-blue-50 border-blue-100 text-blue-700"
                          : item.type === "job"
                            ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                            : "bg-purple-50 border-purple-100 text-purple-700"
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Score: {item.rank.toFixed(2)} •{" "}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Title / Name */}
                  <h3 className="text-base font-bold text-slate-900">
                    {item.type === "user" ? (
                      <Link href={`/profile/${item.id}`} className="hover:text-brand-600">
                        {item.title}
                      </Link>
                    ) : item.type === "job" ? (
                      <Link href={`/jobs`} className="hover:text-brand-600">
                        {item.title}
                      </Link>
                    ) : (
                      <Link href={`/feed`} className="hover:text-brand-600">
                        {item.title || "Post"}
                      </Link>
                    )}
                  </h3>

                  {/* Body description */}
                  <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{item.body}</p>

                  {/* Metadata tags/location */}
                  {item.type === "job" && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>📍 {item.metadata.location}</span>
                      {item.metadata.applyLink && (
                        <a
                          href={item.metadata.applyLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 font-semibold hover:underline"
                        >
                          Apply Link ↗
                        </a>
                      )}
                    </div>
                  )}

                  {item.type === "user" && (
                    <span className="text-xs text-slate-500">@{item.metadata.username}</span>
                  )}

                  {item.type === "content" && item.metadata.author && (
                    <span className="text-xs text-slate-500">
                      Posted by{" "}
                      {item.metadata.author.fullName || `@${item.metadata.author.username}`}
                    </span>
                  )}
                </div>

                {/* Direct action button */}
                <div>
                  {item.type === "user" && item.id !== profile?.userId && (
                    <Link
                      href={`/profile/${item.id}`}
                      className="inline-flex items-center rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-all"
                    >
                      View Profile
                    </Link>
                  )}
                  {item.type === "job" && (
                    <Link
                      href={`/jobs`}
                      className="inline-flex items-center rounded-xl bg-brand-50 hover:bg-brand-100 px-4 py-2 text-xs font-semibold text-brand-700 transition-all"
                    >
                      View Job
                    </Link>
                  )}
                  {item.type === "content" && (
                    <Link
                      href={`/feed`}
                      className="inline-flex items-center rounded-xl bg-brand-50 hover:bg-brand-100 px-4 py-2 text-xs font-semibold text-brand-700 transition-all"
                    >
                      View Feed
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
