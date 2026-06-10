/**
 * Typed fetch wrapper for the Fastify API.
 * Access token is read from the auth store on each request.
 */

import type { ApiError, ApiSuccess } from "@alumni/shared";

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

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, token, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
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

  const json = (await res.json()) as ApiSuccess<T> | ApiError | T;

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
