export interface Env {
  DB: D1Database;
  /** Low-frequency config data only — free plan KV writes are capped at 1,000/day. */
  KV: KVNamespace;
  THEMES_BUCKET: R2Bucket;
  DEVICE_TRACKER: DurableObjectNamespace;

  // Secrets (wrangler secret put)
  MISUB_BASE_URL: string;
  /** External Management API bearer token (/api/ext/v1). Management calls only. */
  MISUB_EXT_TOKEN: string;
  /** MiSub global profileToken. Required to fetch profile subscription content. */
  MISUB_PROFILE_TOKEN: string;
  SESSION_SECRET: string;
  IP_HASH_SALT: string;
}
