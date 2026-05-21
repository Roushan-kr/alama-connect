/**
 * src/modules/auth/types.ts
 *
 * TypeScript types for the auth module.
 */

/** Shape of the JWT access token payload. */
export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  username: string;
  globalRole: string;
}

/** Shape of the JWT refresh token payload. */
export interface RefreshTokenPayload {
  sub: string; // userId
  sessionId: string;
  purpose: "refresh";
}

/** Returned to the client after a successful login or refresh. */
export interface AuthTokens {
  /** Short-lived access token (15 min). Include in Authorization: Bearer header. */
  accessToken: string;
  /** Access token expiry as ISO string for client-side expiry management. */
  expiresAt: string;
}

/** Safe public user shape (never includes passwordHash). */
export interface PublicUser {
  userId: string;
  email: string;
  username: string;
  globalRole: string;
  emailVerified: boolean;
  createdAt: Date;
}
