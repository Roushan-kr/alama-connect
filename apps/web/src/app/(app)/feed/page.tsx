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
  const [newPostBody, setNewPostBody] = useState("")
  const [newPostTitle, setNewPostTitle] = useState("")
  const [postError, setPostError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null)

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

  // Create Post Mutation
  const createPostMutation = useMutation({
    mutationFn: (body: { body: string; title?: string; networkId: string }) => {
      const formData = new FormData()
      formData.append("body", body.body)
      if (body.title) formData.append("title", body.title)
      formData.append("networkId", body.networkId)
      return apiRequest("/api/posts", {
        method: "POST",
        body: formData,
        token: accessToken,
      })
    },
    onSuccess: () => {
      setNewPostBody("")
      setNewPostTitle("")
      queryClient.invalidateQueries({ queryKey: ["feed"] })
    },
  })

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPostBody.trim() || !user) return
    setCreating(true)
    setPostError(null)

    // Fetch user's first network membership from API or DB
    try {
      const profileData: any = await apiRequest("/api/users/me", { token: accessToken })
      const myNetworkId = profileData?.networkMemberships?.[0]?.networkId

      if (!myNetworkId) {
        setPostError("You must belong to a network to post.")
        setCreating(false)
        return
      }

      await createPostMutation.mutateAsync({
        body: newPostBody,
        networkId: myNetworkId,
        ...(newPostTitle ? { title: newPostTitle } : {}),
      })
    } catch (err) {
      setPostError("Failed to publish post")
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
      {/* Left Columns - Posts List & Infinite Scroll */}
      <div className="md:col-span-2 space-y-6">
        {/* Create Post Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Share with your network</h2>
          {postError && <p className="text-xs text-red-600 mb-2">{postError}</p>}
          <form onSubmit={handleCreatePost} className="space-y-3">
            <input
              type="text"
              placeholder="Title (optional)"
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500"
            />
            <textarea
              placeholder="What is on your mind?"
              rows={3}
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 resize-none"
              required
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {creating ? "Publishing…" : "Publish Post"}
              </button>
            </div>
          </form>
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
                  className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm relative"
                >
                  {/* Content Type Badge */}
                  <div className="absolute right-6 top-6">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
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
                      <h4 className="text-base font-semibold text-slate-900">{post.title}</h4>
                    )}
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {post.body}
                    </p>
                  </div>

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
