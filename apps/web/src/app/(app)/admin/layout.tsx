"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { AdminNetworkProvider, useAdminNetwork } from "@/contexts/adminNetwork";

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { networkId, isLoading } = useAdminNetwork();

  const isSuperAdmin = user?.globalRole === "SUPER_ADMIN";

  // Enforce route protection
  useEffect(() => {
    if (isLoading) return;

    // If they have no network ADMIN status AND are not SUPER_ADMIN -> block admin panel
    if (!networkId && !isSuperAdmin) {
      router.push("/feed");
      return;
    }

    // Network scoped pages require a non-null networkId (even for Super Admins)
    const isNetworkScopedPage =
      pathname.startsWith("/admin/verification") ||
      pathname.startsWith("/admin/members") ||
      pathname.startsWith("/admin/roster") ||
      pathname.startsWith("/admin/campaigns");

    if (isNetworkScopedPage && !networkId && !isLoading) {
      router.push("/feed");
    }
  }, [networkId, isSuperAdmin, isLoading, pathname, router]);

  // Loading state skeleton
  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-slate-50 gap-6">
        {/* Sidebar Skeleton */}
        <aside className="w-64 border-r border-slate-200 bg-white p-6 space-y-6 hidden md:block">
          <div className="h-6 w-28 bg-slate-200 rounded animate-pulse" />
          <div className="space-y-3 pt-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 w-full bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </aside>
        {/* Main Content Area */}
        <main className="flex-1 p-8">
          <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
          <div className="h-64 bg-white border border-slate-200 rounded-2xl animate-pulse" />
        </main>
      </div>
    );
  }

  // Define sidebar navigation items
  const navItems = [
    { name: "Dashboard", href: "/admin", isScoped: false },
    { name: "Verification queue", href: "/admin/verification", isScoped: true },
    { name: "Members", href: "/admin/members", isScoped: true },
    { name: "Student roster", href: "/admin/roster", isScoped: true },
    { name: "Campaigns", href: "/admin/campaigns", isScoped: true },
  ];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 bg-white py-6 hidden md:block flex-shrink-0">
        <div className="px-6 mb-6">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
            Navigation
          </span>
        </div>
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            // Hide network-scoped navigation items if networkId is null
            if (item.isScoped && !networkId) return null;

            const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-brand-50 text-brand-600 shadow-sm border border-brand-100/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.name}
              </Link>
            );
          })}

          {/* Super Admin Control Panel Tab */}
          {isSuperAdmin && (
            <div className="pt-4 mt-4 border-t border-slate-100">
              <Link
                href="/admin/super"
                className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  pathname.startsWith("/admin/super")
                    ? "bg-purple-50 text-purple-700 shadow-sm border border-purple-100/50"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                Super admin
              </Link>
            </div>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-4xl mx-auto md:mx-0">
        {children}
      </main>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminNetworkProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminNetworkProvider>
  );
}
