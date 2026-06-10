"use client";

import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm max-w-md mx-auto text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-4">
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 19v-8.93a2 2 0 01.89-1.664l8-4.8a2 2 0 012.22 0l8 4.8A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-2.25-1.5a2 2 0 00-2.22 0l-2.25 1.5"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-semibold text-slate-900">Check your email</h1>
      <p className="mt-2 text-sm text-slate-600">
        We have sent a verification link to your email address. Please click the link to confirm your account.
      </p>

      <div className="mt-8">
        <Link
          href="/login"
          className="inline-flex w-full justify-center rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
