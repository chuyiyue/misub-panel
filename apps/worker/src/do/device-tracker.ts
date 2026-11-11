/**
 * DeviceTracker — one Durable Object instance per subscription (id = subscription id).
 * Records (ipHash, ua) sightings and answers how many distinct devices were
 * seen in the last 24 hours. Sightings live in DO SQLite storage so they
 * survive hibernation; entries older than 24h are pruned on read.
 * Milestone 7 hardens this (rate limits, admin views); milestone 2 wires it
 * into the /sub/:token path.
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

export class DeviceTracker {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/track") {
      const { ipHash, ua } = (await request.json()) as { ipHash: string; ua: string };
      const key = `seen:${ipHash}:${await shortHash(ua)}`;
      await this.state.storage.put(key, Date.now());
      return Response.json({ ok: true });
    }
    if (request.method === "GET" && url.pathname === "/count") {
      const now = Date.now();
      const entries = await this.state.storage.list<number>({ prefix: "seen:" });
      let count = 0;
      const stale: string[] = [];
      for (const [key, at] of entries) {
        if (now - at <= WINDOW_MS) count++;
        else stale.push(key);
      }
      if (stale.length) await this.state.storage.delete(stale);
      return Response.json({ count });
    }
    return new Response("not found", { status: 404 });
  }
}

async function shortHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
