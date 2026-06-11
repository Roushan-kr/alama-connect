"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { apiRequest } from "@/lib/api-client";

export interface AdminNetworkContextType {
  networkId: string | null;
  isLoading: boolean;
}

const AdminNetworkContext = createContext<AdminNetworkContextType | undefined>(
  undefined,
);

export function AdminNetworkProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { accessToken, user } = useAuthStore();
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    apiRequest<any>("/api/users/me", { token: accessToken })
      .then((data) => {
        const adminMembership = data?.networkMemberships?.find(
          (m: any) => m.role === "ADMIN" && m.status === "VERIFIED",
        );
        setNetworkId(adminMembership?.networkId ?? null);
      })
      .catch((err) => {
        console.error("Failed to load user info for network scope", err);
        setNetworkId(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [accessToken, user]);

  return (
    <AdminNetworkContext.Provider value={{ networkId, isLoading }}>
      {children}
    </AdminNetworkContext.Provider>
  );
}

export function useAdminNetwork() {
  const context = useContext(AdminNetworkContext);
  if (context === undefined) {
    throw new Error(
      "useAdminNetwork must be used within an AdminNetworkProvider",
    );
  }
  return context;
}
