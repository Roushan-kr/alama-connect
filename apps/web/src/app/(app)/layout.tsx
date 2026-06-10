"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";
import NotificationsPopover from "@/components/notifications/NotificationsPopover";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, clearSession } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.push("/login");
    }
  }, [mounted, accessToken, router]);

  useEffect(() => {
    if (accessToken && user) {
      apiRequest<any>("/api/users/me", { token: accessToken })
        .then((profileData) => {
          const hasAdminRole =
            profileData?.networkMemberships?.some(
              (m: any) => m.role === "ADMIN" && m.status === "VERIFIED"
            ) || user.globalRole === "SUPER_ADMIN";
          setIsAdmin(!!hasAdminRole);
        })
        .catch((err) => {
          console.error("Failed to load user info for admin check", err);
        });
    }
  }, [accessToken, user]);

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
        token: accessToken,
      });
    } catch (err) {
      console.error("Logout request failed", err);
    } finally {
      clearSession();
      router.push("/login");
    }
  };

  if (!mounted || !accessToken || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-8">
            <Link href="/feed" className="text-xl font-bold tracking-tight text-brand-600">
              AlumniConnect
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/feed"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/feed" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Feed
              </Link>
              <Link
                href="/connections"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/connections" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Connections
              </Link>
              <Link
                href="/jobs"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/jobs" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Jobs
              </Link>
              <Link
                href="/groups"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/groups" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Groups
              </Link>
              <Link
                href="/messages"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/messages" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Messages
              </Link>
              <Link
                href="/search"
                className={`text-sm font-medium transition-colors ${
                  pathname === "/search" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Search
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`text-sm font-medium transition-colors ${
                    pathname === "/admin" ? "text-brand-600" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Real-time Notifications Popover */}
            <NotificationsPopover />

            {/* Profile Link */}
            <Link
              href={`/profile/${user.userId}`}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900"
            >
              <span className="hidden sm:inline">@{user.username}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-800 font-semibold uppercase text-xs">
                {user.username.substring(0, 2)}
              </div>
            </Link>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
