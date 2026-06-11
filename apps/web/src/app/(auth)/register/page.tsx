"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { apiRequest, ApiRequestError } from "@/lib/api-client"

// Zod schemas for validation
const RegisterFormSchema = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-z0-9_]+$/,
        "Username may only contain lowercase letters, numbers, and underscores",
      ),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    networkId: z.uuid("Please select a university network"),
    role: z.enum(["STUDENT", "ALUMNI", "FACULTY"]),
    verificationMethod: z.enum(["ENTRY_NUMBER", "DOCUMENT_UPLOAD"]),
    entryNumber: z.string().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type RegisterFormData = z.infer<typeof RegisterFormSchema>

interface Network {
  networkId: string
  name: string
  code: string
  allowedDomains: string[]
}

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [networks, setNetworks] = useState<Network[]>([])
  const [isLoadingNetworks, setIsLoadingNetworks] = useState(true)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register: formRegister,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterFormSchema as any),
    defaultValues: {
      role: "STUDENT",
      verificationMethod: "ENTRY_NUMBER",
    },
  })

  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState<any>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [isFromRoster, setIsFromRoster] = useState(false)

  const entryNumberValue = watch("entryNumber")
  const networkIdValue = watch("networkId")

  const handleLookup = async () => {
    if (!entryNumberValue) {
      setLookupError("Please enter an entry/roll number first")
      return
    }
    if (!networkIdValue) {
      setLookupError("Please select a university network in Step 2")
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    try {
      const record = await apiRequest<any>(
        `/api/roster/lookup?entryNumber=${encodeURIComponent(entryNumberValue)}&networkId=${networkIdValue}`
      )
      setLookupResult(record)
    } catch (err: any) {
      setLookupError(err.message || "Entry number not found in roster")
    } finally {
      setLookupLoading(false)
    }
  }

  const handleUseRosterData = () => {
    if (!lookupResult) return
    if (lookupResult.fullName) {
      setValue("fullName", lookupResult.fullName)
    }
    if (lookupResult.role) {
      setValue("role", lookupResult.role)
    }
    setIsFromRoster(true)
  }

  const selectedMethod = watch("verificationMethod")

  useEffect(() => {
    setIsLoadingNetworks(true)
    setNetworkError(null)
    apiRequest<Network[]>("/api/networks")
      .then((data) => setNetworks(data))
      .catch((err) => {
        console.error("Failed to load networks", err)
        setNetworkError("Failed to load university networks. Please ensure the API is running and try again.")
      })
      .finally(() => {
        setIsLoadingNetworks(false)
      })
  }, [])

  const handleNextStep = async () => {
    let fieldsToValidate: Array<keyof RegisterFormData> = []
    if (step === 1) {
      fieldsToValidate = ["email", "username", "password", "confirmPassword"]
    } else if (step === 2) {
      fieldsToValidate = ["fullName", "networkId", "role"]
    }

    const isValid = await trigger(fieldsToValidate)
    if (isValid) {
      setStep((prev) => prev + 1)
    }
  }

  const handlePrevStep = () => {
    setStep((prev) => prev - 1)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null)
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.size > 5 * 1024 * 1024) {
        setUploadError("File size must not exceed 5 MB")
        return
      }
      setSelectedFile(file)
    }
  }

  const onSubmit = async (data: RegisterFormData) => {
    setError(null)
    setLoading(true)

    try {
      let documentUrl: string | undefined = undefined

      // Handle file upload if DOCUMENT_UPLOAD is chosen
      if (data.verificationMethod === "DOCUMENT_UPLOAD") {
        if (!selectedFile) {
          setUploadError("Verification document is required")
          setLoading(false)
          return
        }

        const formData = new FormData()
        formData.append("file", selectedFile)

        const uploadResult = await apiRequest<{ documentUrl: string }>("/api/verification/upload", {
          method: "POST",
          body: formData,
        })
        documentUrl = uploadResult.documentUrl
      }

      // Submit final registration
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: {
          email: data.email,
          username: data.username,
          password: data.password,
          fullName: data.fullName,
          networkId: data.networkId,
          role: data.role,
          verificationMethod: data.verificationMethod,
          entryNumber: data.verificationMethod === "ENTRY_NUMBER" ? data.entryNumber : undefined,
          documentUrl,
        },
      })

      router.push("/verify-email")
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Registration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Create Account</h1>
        <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full">
          Step {step} of 3
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* STEP 1: Account Credentials */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                {...formRegister("email")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Username
              <input
                type="text"
                {...formRegister("username")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {errors.username && (
                <p className="text-xs text-red-600 mt-1">{errors.username.message}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                {...formRegister("password")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {errors.password && (
                <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Confirm Password
              <input
                type="password"
                {...formRegister("confirmPassword")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>
              )}
            </label>

            <button
              type="button"
              onClick={handleNextStep}
              className="w-full mt-6 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Continue
            </button>
          </div>
        )}

        {/* STEP 2: Profile & Network Details */}
        {step === 2 && (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Full Name
              {isFromRoster && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 animate-pulse">
                  from roster
                </span>
              )}
              <input
                type="text"
                {...formRegister("fullName")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              {errors.fullName && (
                <p className="text-xs text-red-600 mt-1">{errors.fullName.message}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              University Network
              <select
                {...formRegister("networkId")}
                disabled={isLoadingNetworks || !!networkError}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
              >
                {isLoadingNetworks ? (
                  <option value="">Loading campuses...</option>
                ) : networkError ? (
                  <option value="">Error loading campuses</option>
                ) : (
                  <>
                    <option value="">Select your campus...</option>
                    {networks.map((n) => (
                      <option key={n.networkId} value={n.networkId}>
                        {n.name} ({n.code})
                      </option>
                    ))}
                  </>
                )}
              </select>
              {networkError && (
                <p className="text-xs text-red-600 mt-1">{networkError}</p>
              )}
              {errors.networkId && (
                <p className="text-xs text-red-600 mt-1">{errors.networkId.message}</p>
              )}
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Role
              {isFromRoster && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 animate-pulse">
                  from roster
                </span>
              )}
              <select
                {...formRegister("role")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="STUDENT">Student</option>
                <option value="ALUMNI">Alumni</option>
                <option value="FACULTY">Faculty Member</option>
              </select>
              {errors.role && <p className="text-xs text-red-600 mt-1">{errors.role.message}</p>}
            </label>

            <div className="flex gap-4 mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                className="w-1/2 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="w-1/2 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Verification Method */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="block text-sm font-medium text-slate-700 mb-2">
              Verification Method
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer border border-slate-200 rounded-lg p-3 w-1/2 hover:border-brand-500">
                  <input
                    type="radio"
                    value="ENTRY_NUMBER"
                    {...formRegister("verificationMethod")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-normal text-slate-900">Entry Number</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer border border-slate-200 rounded-lg p-3 w-1/2 hover:border-brand-500">
                  <input
                    type="radio"
                    value="DOCUMENT_UPLOAD"
                    {...formRegister("verificationMethod")}
                    className="text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm font-normal text-slate-900">Document Upload</span>
                </label>
              </div>
            </div>

            {selectedMethod === "ENTRY_NUMBER" ? (
              <div className="space-y-4">
                <div className="flex gap-2 items-end">
                  <label className="block text-sm font-medium text-slate-700 flex-1">
                    Official Entry / Roll Number
                    {isFromRoster && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 animate-pulse">
                        from roster
                      </span>
                    )}
                    <input
                      type="text"
                      {...formRegister("entryNumber")}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      placeholder="e.g. 102103001"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleLookup}
                    disabled={lookupLoading}
                    className="h-10 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 text-xs font-bold text-white transition-all disabled:opacity-50"
                  >
                    {lookupLoading ? "Looking up..." : "Look up"}
                  </button>
                </div>

                {lookupError && (
                  <p className="text-xs text-red-600 font-semibold bg-red-50 p-2 rounded-lg border border-red-100">
                    {lookupError}
                  </p>
                )}

                {lookupResult && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-600 text-sm font-bold">✓</span>
                        <h4 className="text-xs font-bold text-slate-900">Roster Entry Matches!</h4>
                      </div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        roster record
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Full Name</span>
                        <span className="font-semibold text-slate-800">{lookupResult.fullName || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Role</span>
                        <span className="font-semibold text-slate-800">{lookupResult.role || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Branch</span>
                        <span className="font-semibold text-slate-800">{lookupResult.branch || "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Batch & Estimated Years</span>
                        <span className="font-semibold text-slate-800">
                          {lookupResult.batch ? `${lookupResult.batch} (Est: ${lookupResult.batch - 4} - ${lookupResult.batch})` : "—"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleUseRosterData}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-bold text-white shadow-sm transition-all"
                    >
                      Yes, pre-fill form with this data
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="block text-sm font-medium text-slate-700">
                ID / Degree / Transcript (PDF/Image, max 5MB)
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                  className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 file:cursor-pointer hover:file:bg-brand-100"
                />
                {selectedFile && (
                  <p className="text-xs text-green-600 mt-1">
                    Selected file: {selectedFile.name} (
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
                {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
              </div>
            )}

            <div className="flex gap-4 mt-6">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={loading}
                className="w-1/2 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-1/2 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center"
              >
                {loading ? "Registering…" : "Register"}
              </button>
            </div>
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
