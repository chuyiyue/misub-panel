import { Hono } from "hono";
import type { Env } from "./env";
import { MiSubClient } from "./services/misub-client";

export { DeviceTracker } from "./do/device-tracker";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "misub-panel" }));

// Milestone 1 acceptance probe: verifies both MiSub credentials separately.
// Admin auth lands in milestone 2/3 — until then this route is not mounted
// on any public path beyond this explicit check endpoint.
app.get("/api/admin/misub/test", async (c) => {
  const client = MiSubClient.fromEnv(c.env);
  return c.json(await client.testConnection());
});

// Route groups land per milestone:
//   /api/auth/*   milestone 2 (register/login/refresh/forgot)
//   /api/user/*   milestone 2 (profile, subscription, notices, knowledge)
//   /api/admin/*  milestone 3 (users, plans, invite codes, notices, themes, settings)
//   /sub/:token   milestone 2 (validate -> device check -> proxy MiSub content)
//   /api/v1/*     milestone 6 (V2Board/Xboard compatibility layer)
app.notFound((c) => c.json({ status: "fail", message: "not found", data: null }, 404));

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Gated inside scheduled(): the hourly cron refreshes MiSub userInfo,
    // the 03:17 UTC cron expires subscriptions and cleans access_log/sessions.
    // Refresh failures must count and pause after repeated failures — no
    // unbounded outbound retries (see repo outbound discipline notes).
    void event;
    void env;
    void ctx;
  },
};
