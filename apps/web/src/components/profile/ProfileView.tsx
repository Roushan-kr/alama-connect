"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRequest } from "@/lib/api-client"
import { useAuthStore } from "@/store/auth"
import { useState } from "react"
import Link from "next/link"

interface ProfileViewProps {
  isSelf: boolean
  userId?: string
}

export default function ProfileView({ isSelf, userId }: ProfileViewProps) {
  const { accessToken, user } = useAuthStore()
  const queryClient = useQueryClient()

  const isActualSelf = isSelf || (!!user?.userId && userId === user?.userId)

  // Editing states
  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const [isAddingExp, setIsAddingExp] = useState(false)
  const [editingExpId, setEditingExpId] = useState<string | null>(null)
  const [newSkillName, setNewSkillName] = useState("")

  // Edit fields state
  const [fullName, setFullName] = useState("")
  const [headline, setHeadline] = useState("")
  const [bio, setBio] = useState("")
  const [country, setCountry] = useState("")
  const [state, setState] = useState("")
  const [city, setCity] = useState("")
  const [locality, setLocality] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [publicEmail, setPublicEmail] = useState("")

  // Experience form state
  const [expTitle, setExpTitle] = useState("")
  const [expCompany, setExpCompany] = useState("")
  const [expLocation, setExpLocation] = useState("")
  const [expStartDate, setExpStartDate] = useState("")
  const [expEndDate, setExpEndDate] = useState("")
  const [expCurrentlyWorkHere, setExpCurrentlyWorkHere] = useState(false)
  const [expDescription, setExpDescription] = useState("")

  // Error/Success state
  const [errorMsg, setErrorMsg] = useState<string | null>(null)


  const queryKey = isActualSelf ? ["profile-me"] : ["profile-public", userId]
  const queryUrl = isActualSelf ? "/api/users/me" : `/api/users/${userId}`


  // Fetch Profile data
  const {
    data: profileData,
    isLoading,
    error,
  } = useQuery<any>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest<any>(queryUrl, { token: accessToken })
      return res
    },
    enabled: !!accessToken && (isSelf || !!userId),
  })

  // Prefill edit profile form
  const handleOpenEditInfo = () => {
    if (!profileData) return
    const p = profileData.profile || {}
    setFullName(p.fullName || "")
    setHeadline(p.headline || "")
    setBio(p.bio || "")
    setCountry(p.country || "")
    setState(p.state || "")
    setCity(p.city || "")
    setLocality(p.locality || "")
    setLinkedinUrl(p.linkedinUrl || "")
    setPublicEmail(p.publicEmail || "")
    setIsEditingInfo(true)
  }

  // Prefill experience form
  const handleOpenEditExp = (exp: any) => {
    setExpTitle(exp.title || "")
    setExpCompany(exp.company || "")
    setExpLocation(exp.location || "")
    setExpStartDate(exp.startDate ? exp.startDate.slice(0, 10) : "")
    setExpEndDate(exp.endDate ? exp.endDate.slice(0, 10) : "")
    setExpCurrentlyWorkHere(!exp.endDate)
    setExpDescription(exp.description || "")
    setEditingExpId(exp.expId)
  }

  const handleCloseExpForm = () => {
    setIsAddingExp(false)
    setEditingExpId(null)
    setExpTitle("")
    setExpCompany("")
    setExpLocation("")
    setExpStartDate("")
    setExpEndDate("")
    setExpCurrentlyWorkHere(false)
    setExpDescription("")
  }

  // Update Profile Mutation
  const updateProfileMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("/api/users/me", {
        method: "PUT",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setIsEditingInfo(false)
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to update profile.")
    },
  })

  // Experience Mutations
  const addExperienceMutation = useMutation({
    mutationFn: (body: any) =>
      apiRequest("/api/users/me/experience", {
        method: "POST",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      handleCloseExpForm()
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to add work experience.")
    },
  })

  const updateExperienceMutation = useMutation({
    mutationFn: ({ expId, body }: { expId: string; body: any }) =>
      apiRequest(`/api/users/me/experience/${expId}`, {
        method: "PUT",
        body,
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      handleCloseExpForm()
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to update work experience.")
    },
  })

  const deleteExperienceMutation = useMutation({
    mutationFn: (expId: string) =>
      apiRequest(`/api/users/me/experience/${expId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to delete work experience.")
    },
  })

  // Skill Mutations
  const addSkillMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("/api/users/me/skills", {
        method: "POST",
        body: { name },
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setNewSkillName("")
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to add skill.")
    },
  })

  const removeSkillMutation = useMutation({
    mutationFn: (skillId: number) =>
      apiRequest(`/api/users/me/skills/${skillId}`, {
        method: "DELETE",
        token: accessToken,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err?.error || err?.message || "Failed to remove skill.")
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="h-64 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
        <div className="h-44 w-full animate-pulse rounded-2xl bg-white border border-slate-200" />
      </div>
    )
  }

  if (error || !profileData) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center max-w-4xl mx-auto">
        <h3 className="text-sm font-semibold text-slate-800">Profile unavailable</h3>
        <p className="text-xs text-slate-500 mt-1">
          {error?.message || "Could not retrieve the requested profile details."}
        </p>
      </div>
    )
  }

  const p = profileData.profile || {}
  const username = profileData.username
  const fullNameDisplay = p.fullName || `@${username}`
  const headlineDisplay = p.headline || "Alumni Connect member"
  const bioDisplay = p.bio || "No biography provided yet."
  const locationDisplay =
    [p.locality, p.city, p.state, p.country].filter(Boolean).join(", ") || "Location not specified"

  const educations = profileData.educations || []
  const experiences = profileData.workExperiences || []
  const skills = profileData.skills || []
  const networks = profileData.networkMemberships || []


  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Alert/Error banner */}
      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-xs font-semibold text-red-600 shadow-sm">
          {errorMsg}
        </div>
      )}

      {/* Profile Header Hero Card */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
        {/* Banner Area */}
        <div className="h-32 bg-gradient-to-r from-brand-600 to-indigo-600 relative">
          {/* Avatar overlaps the banner */}
          <div className="absolute -bottom-10 left-6 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-extrabold uppercase text-2xl border-4 border-white shadow-md">
            {username.substring(0, 2)}
          </div>
        </div>

        {/* Info Area */}
        <div className="pt-12 pb-6 px-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-extrabold text-slate-900">{fullNameDisplay}</h1>
            <p className="text-sm font-semibold text-brand-600">{headlineDisplay}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
              <span>{locationDisplay}</span>
              {p.publicEmail && (
                <>
                  <span className="text-slate-300">•</span>
                  <a
                    href={`mailto:${p.publicEmail}`}
                    className="hover:text-brand-600 transition-all font-medium"
                  >
                    {p.publicEmail}
                  </a>
                </>
              )}
              {p.linkedinUrl && (
                <>
                  <span className="text-slate-300">•</span>
                  <a
                    href={p.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-brand-600 transition-all font-medium"
                  >
                    LinkedIn
                  </a>
                </>
              )}
            </div>
          </div>

          {isActualSelf && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={() => alert("LinkedIn profile sync is coming soon!")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100/80 px-3.5 py-2 text-xs font-bold text-indigo-700 transition-all cursor-pointer"
                title="LinkedIn Sync (Coming Soon)"
              >
                Sync with LinkedIn
                <span className="text-[8px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded uppercase tracking-wider font-extrabold">
                  Soon
                </span>
              </button>

              <button
                onClick={handleOpenEditInfo}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                title="Edit Details"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
                  />
                </svg>
                Edit Info
              </button>
            </div>
          )}
        </div>
      </div>



      {/* Edit Info Form modal placeholder (inline layout when open) */}
      {isActualSelf && isEditingInfo && (
        <div className="rounded-2xl border border-brand-200 bg-brand-50/10 p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Edit Profile Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Headline
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                rows={3}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Locality
              </label>
              <input
                type="text"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                State
              </label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Country
              </label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                Public Email Address
              </label>
              <input
                type="email"
                value={publicEmail}
                onChange={(e) => setPublicEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                LinkedIn Profile URL
              </label>
              <input
                type="text"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => setIsEditingInfo(false)}
              className="inline-flex justify-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                updateProfileMutation.mutate({
                  fullName,
                  headline,
                  bio,
                  country,
                  state,
                  city,
                  locality,
                  linkedinUrl,
                  publicEmail,
                })
              }
              disabled={updateProfileMutation.isPending}
              className="inline-flex justify-center rounded-lg bg-brand-600 hover:bg-brand-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              Save Details
            </button>
          </div>
        </div>
      )}

      {/* Profile layout body */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: main bio, experience */}
        <div className="md:col-span-2 space-y-6">
          {/* About section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 mb-3 uppercase tracking-wider">
              About
            </h2>
            <p className="text-xs text-slate-650 leading-relaxed whitespace-pre-line">
              {bioDisplay}
            </p>
          </div>

          {/* Experience Timeline */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                Work Experience
              </h2>
              {isActualSelf && !isAddingExp && !editingExpId && (
                <button
                  onClick={() => setIsAddingExp(true)}
                  className="text-xs font-bold text-brand-600 hover:text-brand-800 transition-all cursor-pointer"
                >
                  + Add Experience
                </button>
              )}
            </div>

            {/* Experience CRUD inline form */}
            {isActualSelf && (isAddingExp || editingExpId) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-700">
                  {editingExpId ? "Edit Experience Entry" : "New Experience Entry"}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      Title / Role
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Software Engineer"
                      value={expTitle}
                      onChange={(e) => setExpTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      Company
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Google"
                      value={expCompany}
                      onChange={(e) => setExpCompany(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bangalore, India"
                      value={expLocation}
                      onChange={(e) => setExpLocation(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={expStartDate}
                        onChange={(e) => setExpStartDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={expCurrentlyWorkHere ? "" : expEndDate}
                        disabled={expCurrentlyWorkHere}
                        onChange={(e) => setExpEndDate(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="currentlyWorkHere"
                      checked={expCurrentlyWorkHere}
                      onChange={(e) => {
                        setExpCurrentlyWorkHere(e.target.checked)
                        if (e.target.checked) {
                          setExpEndDate("")
                        }
                      }}
                      className="rounded border-slate-350 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <label htmlFor="currentlyWorkHere" className="text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                      I currently work here
                    </label>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                      Description
                    </label>
                    <textarea
                      value={expDescription}
                      rows={2}
                      onChange={(e) => setExpDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={handleCloseExpForm}
                    className="inline-flex justify-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-650 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const payload = {
                        title: expTitle,
                        company: expCompany,
                        location: expLocation || undefined,
                        startDate: expStartDate,
                        endDate: expCurrentlyWorkHere ? undefined : (expEndDate || undefined),
                        description: expDescription || undefined,
                      }
                      if (editingExpId) {
                        updateExperienceMutation.mutate({ expId: editingExpId, body: payload })
                      } else {
                        addExperienceMutation.mutate(payload)
                      }
                    }}
                    className="inline-flex justify-center rounded-lg bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                  >
                    Save Entry
                  </button>
                </div>
              </div>
            )}

            {/* Experiences list */}
            {experiences.length === 0 ? (
              <p className="text-xs text-slate-500">No work experience listed yet.</p>
            ) : (
              <div className="relative border-l border-slate-100 ml-3 pl-6 space-y-6">
                {experiences.map((exp: any) => {
                  const startStr = exp.startDate
                    ? new Date(exp.startDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })
                    : ""
                  const endStr = exp.endDate
                    ? new Date(exp.endDate).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                      })
                    : "Present"
                  return (
                    <div key={exp.expId} className="relative group">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-brand-500 bg-white" />

                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">{exp.title}</h3>
                          <p className="text-xs font-semibold text-slate-600">
                            {exp.company} • {exp.location}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {startStr} — {endStr}
                          </p>
                          {exp.description && (
                            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                              {exp.description}
                            </p>
                          )}
                        </div>

                        {isActualSelf && !isAddingExp && !editingExpId && (
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              onClick={() => handleOpenEditExp(exp)}
                              className="text-[10px] text-brand-600 font-bold hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Remove experience?")) {
                                  deleteExperienceMutation.mutate(exp.expId)
                                }
                              }}
                              className="text-[10px] text-red-650 font-bold hover:underline cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Education, Skills, Networks */}
        <div className="space-y-6">
          {/* Education section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Education
            </h2>
            {educations.length === 0 ? (
              <p className="text-xs text-slate-500">No education entries listed.</p>
            ) : (
              <div className="space-y-4">
                {educations.map((edu: any) => (
                  <div
                    key={edu.eduId}
                    className="space-y-0.5 border-b border-slate-50 pb-3 last:border-b-0 last:pb-0"
                  >
                    <h4 className="font-bold text-slate-900 text-xs">
                      {edu.degree ? `${edu.degree} in ` : ""}
                      {edu.field || "General Studies"}
                    </h4>
                    {edu.network && (
                      <p className="text-xs font-semibold text-slate-600">{edu.network.name}</p>
                    )}
                    <p className="text-[10px] text-slate-400">
                      {edu.startYear} — {edu.endYear || "Present"}
                      {edu.isVerified && (
                        <span className="ml-2 font-extrabold text-green-600 bg-green-50 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider">
                          Verified
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Skills section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Skills
            </h2>

            {/* Add Skill form */}
            {isActualSelf && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (newSkillName.trim()) {
                    addSkillMutation.mutate(newSkillName.trim())
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Add a skill..."
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={addSkillMutation.isPending || !newSkillName.trim()}
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 px-3 py-1.5 text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            )}

            {skills.length === 0 ? (
              <p className="text-xs text-slate-500">No skills listed yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill: any) => (
                  <span
                    key={skill.skillId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    {skill.name}
                    {isActualSelf && (
                      <button
                        type="button"
                        onClick={() => removeSkillMutation.mutate(skill.skillId)}
                        className="text-slate-400 hover:text-slate-700 transition-all font-bold cursor-pointer text-[10px] ml-0.5"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Verified Networks section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              Campus Networks
            </h2>
            {networks.length === 0 ? (
              <p className="text-xs text-slate-500">No network memberships.</p>
            ) : (
              <div className="space-y-3">
                {networks.map((member: any, idx: number) => (
                  <div
                    key={`${member.networkId}-${idx}`}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{member.network.name}</p>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">
                        {member.network.code}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[9px] font-extrabold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-100 uppercase tracking-wide">
                        {member.role}
                      </span>
                      <span
                        className={`text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                          member.status === "VERIFIED"
                            ? "bg-green-50 text-green-700 border border-green-150"
                            : member.status === "PENDING"
                              ? "bg-amber-50 text-amber-700 border border-amber-150"
                              : "bg-slate-50 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {member.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
