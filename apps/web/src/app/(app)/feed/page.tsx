"use client"

import { useEffect, useRef, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiRequest, ApiRequestError } from "@/lib/api-client"
import { useAuthStore } from "@/store/auth"

interface FeedMediaItem {
  mediaId: string
  url: string | null
  mediaType: string
}

interface AuthorSummary {
  userId: string
  username: string
  fullName: string | null
  headline: string | null
  profileImage: string | null
}

interface FeedItem {
  contentId: string
  contentType: string
  networkId: string
  groupId: string | null
  title: string | null
  body: string | null
  tags: string[]
  meta: Record<string, any>
  visibility: string
  isPinned: boolean
  createdAt: string
  author: AuthorSummary
  likesCount: number
  commentsCount: number
  userLiked: boolean
  media: FeedMediaItem[]
}

interface FeedPage {
  data: FeedItem[]
  meta: {
    nextCursor: string | null
    hasMore: boolean
    limit: number
  }
}

export default function FeedPage() {
  const queryClient = useQueryClient()
  const { accessToken, user } = useAuthStore()
  
  // Composer states
  const [activeTab, setActiveTab] = useState<"post" | "job" | "announcement" | "newsletter">("post")
  const [postError, setPostError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null)

  // 1. Social Post states
  const [newPostTitle, setNewPostTitle] = useState("")
  const [newPostBody, setNewPostBody] = useState("")
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])

  // 2. Job states
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [jobLocation, setJobLocation] = useState("")
  const [jobApplyLink, setJobApplyLink] = useState("")
  const [jobTags, setJobTags] = useState("")
  const [jobExpiresAt, setJobExpiresAt] = useState("")

  // 3. Announcement & Newsletter states
  const [adminTitle, setAdminTitle] = useState("")
  const [adminBody, setAdminBody] = useState("")

  const observerTarget = useRef<HTMLDivElement>(null)

  // Fetch Feed using useInfiniteQuery
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } =
    useInfiniteQuery<FeedPage>({
      queryKey: ["feed"],
      queryFn: ({ pageParam = undefined }) =>
        apiRequest<FeedPage>(
          `/api/feed/global?limit=10${pageParam ? `&cursor=${pageParam}` : ""}`,
          {
            token: accessToken,
          },
        ),
      initialPageParam: undefined,
      getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
      enabled: !!accessToken,
    })

  // Load user profile to check admin status and get network memberships
  const { data: profile } = useQuery<any>({
    queryKey: ["profile-me"],
    queryFn: () => apiRequest("/api/users/me", { token: accessToken }),
    enabled: !!accessToken,
  })

  const myNetworkId = profile?.networkMemberships?.[0]?.networkId
  const myMembership = profile?.networkMemberships?.[0]
  const isAdmin = myMembership?.role === "ADMIN" || user?.globalRole === "SUPER_ADMIN"

  // Image Upload helpers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    const files = Array.from(e.target.files)
    if (imageFiles.length + files.length > 4) {
      setPostError("Maximum 4 images per post")
      return
    }

    const newFiles = [...imageFiles, ...files]
    setImageFiles(newFiles)

    const newPreviews = files.map((file) => URL.createObjectURL(file))
    setImagePreviews([...imagePreviews, ...newPreviews])
  }

  const removeImage = (index: number) => {
    const newFiles = [...imageFiles]
    newFiles.splice(index, 1)
    setImageFiles(newFiles)

    const newPreviews = [...imagePreviews]
    const preview = newPreviews[index]
    if (preview) {
      URL.revokeObjectURL(preview)
    }
    newPreviews.splice(index, 1)
    setImagePreviews(newPreviews)
  }

  // Infinite Scroll Observer
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage()
        }
      },
      { threshold: 0.8 },
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Mutations
  const createPostMutation = useMutation({
    mutationFn: (payload: { body: string; title?: string; networkId: string; files: File[] }) => {
      const formData = new FormData()
      formData.append("body", payload.body)
      if (payload.title) formData.append("title", payload.title)
      formData.append("networkId", payload.networkId)
      payload.files.forEach((file) => {
        formData.append("images", file)
      })
      return apiRequest("/api/posts", {
        method: "POST",
        body: formData,
        token: accessToken,
      })
    },
    onSuccess: () => {
      setNewPostBody("")
      setNewPostTitle("")
      setImageFiles([])
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
      setImagePreviews([])
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const createJobMutation = useMutation({
    mutationFn: (body: {
      title: string
      description: string
      location: string
      applyLink: string
      tags: string[]
      expiresAt: string
      networkId: string
    }) =>
      apiRequest("/api/jobs", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setJobTitle("")
      setJobDescription("")
      setJobLocation("")
      setJobApplyLink("")
      setJobTags("")
      setJobExpiresAt("")
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const createAnnouncementMutation = useMutation({
    mutationFn: (body: { title: string; body: string; networkId: string }) =>
      apiRequest("/api/admin/announcements", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setAdminTitle("")
      setAdminBody("")
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const createNewsletterMutation = useMutation({
    mutationFn: (body: { title: string; body: string; networkId: string }) =>
      apiRequest("/api/admin/newsletters", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      setAdminTitle("")
      setAdminBody("")
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const handleCreateContent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !user) return

    if (!myNetworkId) {
      setPostError("You must belong to a network to publish content.")
      return
    }

    setCreating(true)
    setPostError(null)

    try {
      if (activeTab === "post") {
        if (!newPostBody.trim()) return
        await createPostMutation.mutateAsync({
          body: newPostBody,
          networkId: myNetworkId,
          files: imageFiles,
          ...(newPostTitle ? { title: newPostTitle } : {}),
        })
      } else if (activeTab === "job") {
        if (!jobTitle.trim() || !jobDescription.trim() || !jobLocation.trim()) {
          setPostError("Title, Description, and Location are required.")
          setCreating(false)
          return
        }
        await createJobMutation.mutateAsync({
          title: jobTitle,
          description: jobDescription,
          location: jobLocation,
          applyLink: jobApplyLink,
          tags: jobTags ? jobTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
          expiresAt: jobExpiresAt ? new Date(jobExpiresAt).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          networkId: myNetworkId,
        })
      } else if (activeTab === "announcement") {
        if (!adminTitle.trim() || !adminBody.trim()) {
          setPostError("Title and Body are required.")
          setCreating(false)
          return
        }
        await createAnnouncementMutation.mutateAsync({
          title: adminTitle,
          body: adminBody,
          networkId: myNetworkId,
        })
      } else if (activeTab === "newsletter") {
        if (!adminTitle.trim() || !adminBody.trim()) {
          setPostError("Title and Body are required.")
          setCreating(false)
          return
        }
        await createNewsletterMutation.mutateAsync({
          title: adminTitle,
          body: adminBody,
          networkId: myNetworkId,
        })
      }
    } catch (err: any) {
      setPostError(err.message || "Failed to publish content")
    } finally {
      setCreating(false)
    }
  }

  // Toggle Like Mutation
  const toggleLikeMutation = useMutation({
    mutationFn: ({ contentId, userLiked }: { contentId: string; userLiked: boolean }) =>
      apiRequest(`/api/posts/${contentId}/like`, {
        method: userLiked ? "DELETE" : "POST",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {/* Left Columns - Feed & Composer */}
      <div className="md:col-span-2 space-y-6">
        {/* Dynamic Composer Card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-1">
            <button
              onClick={() => {
                setActiveTab("post")
                setPostError(null)
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold rounded-xl tracking-wide uppercase transition-all duration-200 ${
                activeTab === "post"
                  ? "bg-white text-brand-600 shadow-sm border border-slate-200/40"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              }`}
            >
              <span>📝</span> Post
            </button>
            <button
              onClick={() => {
                setActiveTab("job")
                setPostError(null)
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold rounded-xl tracking-wide uppercase transition-all duration-200 ${
                activeTab === "job"
                  ? "bg-white text-brand-600 shadow-sm border border-slate-200/40"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
              }`}
            >
              <span>💼</span> Job
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    setActiveTab("announcement")
                    setPostError(null)
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold rounded-xl tracking-wide uppercase transition-all duration-200 ${
                    activeTab === "announcement"
                      ? "bg-white text-brand-600 shadow-sm border border-slate-200/40"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                  }`}
                >
                  <span>📢</span> Announce
                </button>
                <button
                  onClick={() => {
                    setActiveTab("newsletter")
                    setPostError(null)
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold rounded-xl tracking-wide uppercase transition-all duration-200 ${
                    activeTab === "newsletter"
                      ? "bg-white text-brand-600 shadow-sm border border-slate-200/40"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                  }`}
                >
                  <span>✉️</span> Newsletter
                </button>
              </>
            )}
          </div>

          {/* Composer Body */}
          <div className="p-6">
            {postError && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
                ⚠️ {postError}
              </div>
            )}

            <form onSubmit={handleCreateContent} className="space-y-4">
              {activeTab === "post" && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Title (optional)"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                  />
                  <textarea
                    placeholder="What is on your mind?"
                    rows={4}
                    value={newPostBody}
                    onChange={(e) => setNewPostBody(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none transition-all placeholder:text-slate-400"
                    required
                  />

                  {/* Image Uploader & Preview Grid */}
                  <div className="space-y-2">
                    {imagePreviews.length > 0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
                            <img src={preview} alt="Attachment preview" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1 right-1 h-5 w-5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full flex items-center justify-center text-[10px] transition-all"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {imageFiles.length < 4 && (
                      <label className="flex flex-col items-center justify-center w-full h-16 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 transition-all duration-200">
                        <div className="flex items-center gap-2 text-slate-500 hover:text-slate-800">
                          <span className="text-sm">📸</span>
                          <span className="text-xs font-medium">Attach images (Max 4, PNG/JPG)</span>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "job" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder="Job Title (e.g. Lead React Developer)"
                      value={jobTitle}
                      onChange={(e) => setJobTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                      required
                    />
                  </div>
                  <div className="md:col-span-2">
                    <textarea
                      placeholder="Job Description and requirements..."
                      rows={4}
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none transition-all placeholder:text-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Location (e.g. Remote / Chicago, IL)"
                      value={jobLocation}
                      onChange={(e) => setJobLocation(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="url"
                      placeholder="Apply Link (URL)"
                      value={jobApplyLink}
                      onChange={(e) => setJobApplyLink(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Tags (comma separated, e.g. remote, nextjs)"
                      value={jobTags}
                      onChange={(e) => setJobTags(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div>
                    <input
                      type="date"
                      placeholder="Expiration Date"
                      value={jobExpiresAt}
                      onChange={(e) => setJobExpiresAt(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 bg-white outline-none focus:border-brand-500 transition-all"
                    />
                  </div>
                </div>
              )}

              {(activeTab === "announcement" || activeTab === "newsletter") && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder={`${activeTab === "announcement" ? "Announcement" : "Newsletter"} Title`}
                    value={adminTitle}
                    onChange={(e) => setAdminTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 transition-all placeholder:text-slate-400"
                    required
                  />
                  <textarea
                    placeholder="Write your content body here..."
                    rows={5}
                    value={adminBody}
                    onChange={(e) => setNewPostBody(e.target.value)} // compatibility
                    onInput={(e: any) => setAdminBody(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none transition-all placeholder:text-slate-400"
                    required
                  />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm disabled:opacity-50 flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98]"
                >
                  {creating ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Publishing…</span>
                    </>
                  ) : (
                    `Publish ${activeTab}`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Feed List */}
        {status === "pending" && (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-48 w-full animate-pulse rounded-2xl bg-slate-200/60" />
            ))}
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6">
            {data.pages
              .flatMap((page) => page.data)
              .map((post) => (
                <div
                  key={post.contentId}
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative transition-all hover:shadow-md"
                >
                  {/* Content Type Badge */}
                  <div className="absolute right-6 top-6">
                    <span
                      className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider ${
                        post.contentType === "JOB"
                          ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                          : post.contentType === "ANNOUNCEMENT"
                          ? "bg-amber-50 border-amber-100 text-amber-700"
                          : post.contentType === "NEWSLETTER"
                          ? "bg-purple-50 border-purple-100 text-purple-700"
                          : "bg-slate-50 border-slate-100 text-slate-500"
                      }`}
                    >
                      {post.contentType}
                    </span>
                  </div>

                  {/* Card Header */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-semibold uppercase text-sm">
                      {post.author.username.substring(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        {post.author.fullName ?? `@${post.author.username}`}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {post.author.headline || "Alumni Member"}
                      </p>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="mt-4 space-y-2">
                    {post.title && (
                      <h4 className="text-base font-bold text-slate-900">{post.title}</h4>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {post.body}
                    </p>
                  </div>

                  {/* Render Custom Job Layout Detail Box */}
                  {post.contentType === "JOB" && (
                    <div className="mt-4 p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1 text-xs text-slate-600">
                        {post.meta?.location && (
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            <span>📍 Location:</span>
                            <span>{post.meta.location}</span>
                          </div>
                        )}
                        {post.meta?.expiresAt && (
                          <div className="text-[10px] text-slate-400">
                            Deadline: {new Date(post.meta.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      {post.meta?.applyLink && (
                        <div>
                          <a
                            href={post.meta.applyLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-all shadow-sm active:scale-[0.98]"
                          >
                            Apply Now ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Render Post Media Images */}
                  {post.media.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {post.media.map((m) => (
                        <div
                          key={m.mediaId}
                          className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
                        >
                          {m.url && (
                            <img
                              src={m.url}
                              alt="Media attachment"
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[11px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons Footer */}
                  <div className="mt-6 flex items-center gap-6 border-t border-slate-100 pt-4">
                    <button
                      onClick={() =>
                        toggleLikeMutation.mutate({
                          contentId: post.contentId,
                          userLiked: post.userLiked,
                        })
                      }
                      className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                        post.userLiked ? "text-red-500" : "text-slate-500 hover:text-red-500"
                      }`}
                    >
                      <svg
                        className="h-4 w-4"
                        fill={post.userLiked ? "currentColor" : "none"}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      <span>{post.likesCount}</span>
                    </button>

                    <button
                      onClick={() => setActiveCommentPostId(post.contentId)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <span>{post.commentsCount} Comments</span>
                    </button>
                  </div>
                </div>
              ))}

            {/* Sentinel div for infinite scroll */}
            <div ref={observerTarget} className="flex justify-center py-4">
              {isFetchingNextPage && (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column - University Quick Info */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Quick Links</h2>
          <div className="mt-4 space-y-2 text-xs">
            <p className="text-slate-500 leading-relaxed">
              Verify your classmates, check active jobs, or announce events network-wide.
            </p>
          </div>
        </div>
      </div>

      {/* Comments Drawer / Sheet */}
      {activeCommentPostId && (
        <CommentsDrawer
          contentId={activeCommentPostId}
          onClose={() => setActiveCommentPostId(null)}
        />
      )}
    </div>
  )
}

// Comments Drawer Component
interface Comment {
  commentId: string
  body: string
  createdAt: string
  user: {
    username: string
    profile: { fullName: string | null } | null
  }
}

function CommentsDrawer({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const { accessToken } = useAuthStore()
  const queryClient = useQueryClient()
  const [commentText, setCommentText] = useState("")
  const [posting, setPosting] = useState(false)

  // Fetch comments
  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["comments", contentId],
    queryFn: () =>
      apiRequest<Comment[]>(`/api/posts/${contentId}/comments`, {
        token: accessToken,
      }),
  })

  // Post comment mutation
  const postCommentMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest(`/api/posts/${contentId}/comments`, {
        method: "POST",
        body: { body },
        token: accessToken,
      }),
    onSuccess: () => {
      setCommentText("")
      queryClient.invalidateQueries({ queryKey: ["comments", contentId] })
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setPosting(true)
    try {
      await postCommentMutation.mutateAsync(commentText)
    } catch (err) {
      console.error(err)
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md bg-white p-6 shadow-xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Comments</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-50">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Comment List */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {isLoading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          )}

          {!isLoading && comments.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-8">
              No comments yet. Share your thoughts!
            </p>
          )}

          {!isLoading &&
            comments.map((comment) => (
              <div key={comment.commentId} className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-semibold uppercase text-xs">
                  {comment.user.username.substring(0, 2)}
                </div>
                <div className="flex-1 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      {comment.user.profile?.fullName ?? `@${comment.user.username}`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(comment.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{comment.body}</p>
                </div>
              </div>
            ))}
        </div>

        {/* Comment Input Footer */}
        <form onSubmit={handlePostComment} className="border-t border-slate-100 pt-4 flex gap-2">
          <input
            type="text"
            placeholder="Write a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900 outline-none focus:border-brand-500"
            required
          />
          <button
            type="submit"
            disabled={posting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </form>
      </div>
    </div>
  )
}
