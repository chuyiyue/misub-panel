/**
 * MiSubClient — the panel's only channel to MiSub.
 *
 * Two distinct credentials, do not mix them up (verified against MiSub source,
 * functions/modules/subscription/request-context.js):
 * - External Management API: `{base}/api/ext/v1`, `Authorization: Bearer <extToken>`.
 *   Used for profiles / subscriptions management data.
 * - Subscription content: `{base}/sub/{profileToken}/{customId || id}` where
 *   profileToken is MiSub's *global* setting, not a per-profile secret and not
 *   the ext token.
 *
 * Outbound discipline: hard timeout, at most one retry, no retry loops.
 * Callers are expected to fall back to cached content when this fails.
 */

export interface MisubProfile {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  isPublic?: boolean;
  customId?: string;
  subscriptionIds?: string[];
  manualNodeIds?: string[];
  target?: string;
  [key: string]: unknown;
}

export interface MisubUserInfo {
  upload: number;
  download: number;
  total: number;
  /** unix seconds */
  expire: number;
}

export class MisubError extends Error {
  constructor(
    message: string,
    readonly kind: "unauthorized" | "forbidden" | "not_found" | "http" | "network" | "timeout",
    readonly status?: number,
  ) {
    super(message);
    this.name = "MisubError";
  }
}

const EXT_TIMEOUT_MS = 10_000;
const SUB_TIMEOUT_MS = 20_000;

/** Query params that force MiSub to bypass its caches; end users must not pass these through. */
const STRIPPED_SUB_PARAMS = ["refresh", "nocache", "debug"];

export class MiSubClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly extToken: string,
    private readonly profileToken: string,
  ) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  static fromEnv(env: {
    MISUB_BASE_URL: string;
    MISUB_EXT_TOKEN: string;
    MISUB_PROFILE_TOKEN: string;
  }): MiSubClient {
    return new MiSubClient(env.MISUB_BASE_URL, env.MISUB_EXT_TOKEN, env.MISUB_PROFILE_TOKEN);
  }

  /** fetch with timeout; exactly one retry on network errors and 5xx. */
  private async fetchOnceRetry(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal });
        if (res.status >= 500 && attempt === 0) {
          await res.body?.cancel().catch(() => {});
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt === 1) {
          const isTimeout = err instanceof Error && err.name === "AbortError";
          throw new MisubError(
            isTimeout ? `MiSub request timed out after ${timeoutMs}ms` : `MiSub unreachable: ${String(err)}`,
            isTimeout ? "timeout" : "network",
          );
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new MisubError(`MiSub request failed: ${String(lastError)}`, "network");
  }

  private async ext<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchOnceRetry(`${this.base}/api/ext/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.extToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    }, EXT_TIMEOUT_MS);
    if (!res.ok) {
      const kind = res.status === 401 ? "unauthorized" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : "http";
      throw new MisubError(`MiSub ext API ${path} -> ${res.status}`, kind, res.status);
    }
    const body = (await res.json()) as { success: boolean; data: T };
    return body.data;
  }

  listProfiles(): Promise<MisubProfile[]> {
    return this.ext<MisubProfile[]>("/profiles?page=1&pageSize=100");
  }

  getProfile(profileId: string): Promise<MisubProfile> {
    return this.ext<MisubProfile>(`/profiles/${encodeURIComponent(profileId)}`);
  }

  refreshProfile(profileId: string): Promise<unknown> {
    return this.ext(`/profiles/${encodeURIComponent(profileId)}/refresh`, { method: "POST" });
  }

  /**
   * Fetch a profile's subscription content for proxying to an end user.
   * The client User-Agent and format params are passed through verbatim:
   * MiSub decides the output format from them, and a browser-like UA would
   * hit MiSub's disguise page before any token check.
   */
  async fetchProfileSubscription(
    profile: Pick<MisubProfile, "id" | "customId">,
    client: { userAgent: string; searchParams: URLSearchParams },
  ): Promise<Response> {
    const identifier = profile.customId || profile.id;
    const params = new URLSearchParams(client.searchParams);
    for (const p of STRIPPED_SUB_PARAMS) params.delete(p);
    const qs = params.toString();
    const url = `${this.base}/sub/${encodeURIComponent(this.profileToken)}/${encodeURIComponent(identifier)}${qs ? `?${qs}` : ""}`;
    const res = await this.fetchOnceRetry(url, {
      method: "GET",
      headers: { "User-Agent": client.userAgent },
    }, SUB_TIMEOUT_MS);
    if (res.status === 403) throw new MisubError("MiSub rejected the profile token", "forbidden", 403);
    if (res.status === 404) throw new MisubError("MiSub profile not found or disabled", "not_found", 404);
    if (!res.ok) throw new MisubError(`MiSub subscription fetch -> ${res.status}`, "http", res.status);
    return res;
  }

  /** Two-path connection test for the admin settings page: ext API and content fetch are separate credentials. */
  async testConnection(): Promise<{ extApi: boolean; contentFetch: boolean; profileCount?: number; error?: string }> {
    try {
      const profiles = await this.listProfiles();
      let contentFetch = false;
      const first = profiles.find((p) => p.enabled);
      if (first) {
        const res = await this.fetchProfileSubscription(first, {
          userAgent: "misub-panel/healthcheck",
          searchParams: new URLSearchParams(),
        });
        contentFetch = res.ok;
        await res.body?.cancel().catch(() => {});
      }
      return { extApi: true, contentFetch, profileCount: profiles.length };
    } catch (err) {
      return { extApi: false, contentFetch: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Parse a `subscription-userinfo` response header: `upload=..; download=..; total=..; expire=..` */
export function parseUserInfoHeader(header: string | null): MisubUserInfo | null {
  if (!header) return null;
  const out: Record<string, number> = {};
  for (const part of header.split(";")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (k && v) out[k] = Number(v) || 0;
  }
  if (!("total" in out)) return null;
  return { upload: out.upload ?? 0, download: out.download ?? 0, total: out.total, expire: out.expire ?? 0 };
}
