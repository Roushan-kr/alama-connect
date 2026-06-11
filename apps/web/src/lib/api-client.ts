/**
 * Typed fetch wrapper for the Fastify API.
 * Access token is read from the auth store on each request.
 */

import type { ApiError, ApiSuccess } from "@alumni/shared";
import { useAuthStore } from "@/store/auth";

const API_BASE =
  process.env["NEXT_PUBLIC_API_URL"]?.replace(/\/$/, "") ??
  "http://localhost:3001";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
}

let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error("Refresh failed");
    }
    const json = await res.json();
    const data = json.data; // { accessToken: string, expiresAt: string }
    
    const store = useAuthStore.getState();
    if (store.user) {
      store.setSession(data.accessToken, data.expiresAt, store.user);
    }
    return data.accessToken;
  } catch (err) {
    useAuthStore.getState().clearSession();
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Always use the latest token from the store if logged in, falling back to option token
  const storeToken = useAuthStore.getState().accessToken;
  const activeToken = storeToken || token;
  if (activeToken) {
    headers.set("Authorization", `Bearer ${activeToken}`);
  }

  const fetchOptions: RequestInit = {
    ...init,
    headers,
    credentials: "include",
  };
  
  if (body !== undefined) {
    fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, fetchOptions);

  // If unauthorized and we have a token, attempt automatic token refresh
  if (res.status === 401 && activeToken) {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const newAccessToken = await refreshPromise;
    if (newAccessToken) {
      headers.set("Authorization", `Bearer ${newAccessToken}`);
      const retryRes = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
      });
      const retryText = await retryRes.text();
      const retryJson = retryText ? JSON.parse(retryText) : {};
      if (retryRes.ok) {
        if (retryJson !== null && typeof retryJson === "object" && "data" in retryJson) {
          const keys = Object.keys(retryJson);
          if (keys.length === 1 && keys[0] === "data") {
            return (retryJson as ApiSuccess<T>).data;
          }
        }
        return retryJson as T;
      }
      const err = retryJson as ApiError;
      throw new ApiRequestError(
        err.error ?? retryRes.statusText,
        err.code ?? "REQUEST_FAILED",
        retryRes.status,
      );
    }
  }

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = json as ApiError;
    throw new ApiRequestError(
      err.error ?? res.statusText,
      err.code ?? "REQUEST_FAILED",
      res.status,
    );
  }

  if (json !== null && typeof json === "object" && "data" in json) {
    const keys = Object.keys(json);
    if (keys.length === 1 && keys[0] === "data") {
      return (json as ApiSuccess<T>).data;
    }
  }

  return json as T;
}

export { API_BASE };
