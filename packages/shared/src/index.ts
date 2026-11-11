/** Shared types between worker, user-web and admin-web. */

export type Role = "user" | "admin";
export type UserStatus = "active" | "banned";
export type SubscriptionStatus = "active" | "expired" | "banned";
export type ThemeKind = "native" | "v2board" | "xboard";

export interface Plan {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  deviceLimit: number;
  misubProfileId: string;
  priceCents: number;
  sort: number;
  enabled: boolean;
}

export interface SubscriptionInfo {
  id: string;
  planId: string;
  /** Full panel subscription URL path secret is only ever returned to its owner. */
  token: string;
  startedAt: number;
  expiresAt: number;
  status: SubscriptionStatus;
  deviceLimit: number;
}
