/**
 * Input/output contracts for Authentication Service use cases.
 *
 * Centralizes request and response interfaces in a single file,
 * keeping API contracts readable and separated from business logic.
 */
import { UserRole } from '../domain/entities/UserRole';

// ── RegisterUser ─────────────────────────────────────────────────────────────

export interface RegisterUserInput {
  username: string;
  name: string;
  surname: string;
  email: string;
  password: string;
}

export interface RegisterUserOutput {
  user: {
    id: string;
    username: string;
    name: string;
    surname: string;
    email: string;
    role: UserRole;
  };
}

// ── LoginUser ─────────────────────────────────────────────────────────────────

export interface LoginUserInput {
  username: string;
  password: string;
}

export interface LoginUserOutput {
  token: string;
  session: {
    id: string;
    tokenId: string;
    loggedIn: Date;
    expiresAt: Date;
  };
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
}

// ── GenerateGuestSession ──────────────────────────────────────────────────────

export interface GenerateGuestSessionOutput {
  token: string;
  session: {
    id: string;
    tokenId: string;
    loggedIn: Date;
    expiresAt: Date;
  };
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
}

// ── GetCurrentUser ────────────────────────────────────────────────────────────

export interface GetCurrentUserInput {
  userId: string;
  sessionId: string;
}

export interface GetCurrentUserOutput {
  id: string;
  username: string;
  name: string;
  surname: string;
  email: string;
  role: UserRole;
}

// ── LogoutUser ────────────────────────────────────────────────────────────────

export interface LogoutUserInput {
  userId: string;
  sessionId: string;
}

// ── ListUserSessions ──────────────────────────────────────────────────────────

export interface ListUserSessionsInput {
  userId: string;
}

export interface SessionSummary {
  id: string;
  tokenId: string;
  loggedIn: Date;
  expiresAt: Date;
  loggedOut: Date | null;
  isRevoked: boolean;
}

export interface ListUserSessionsOutput {
  sessions: SessionSummary[];
}

// ── RevokeSession ─────────────────────────────────────────────────────────────

export interface RevokeSessionInput {
  requestingUserId: string;
  sessionId: string;
}
