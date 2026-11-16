import type { Pool } from "pg";

type HyperdriveEnv = {
  HYPERDRIVE?: { connectionString?: string };
  ASSETS?: unknown;
};

function workerEnv(): HyperdriveEnv | undefined {
  return (globalThis as { __env__?: HyperdriveEnv }).__env__;
}

/** True inside a Cloudflare Worker. Preview and local Node stay false. */
export function cloudflareWorker(): boolean {
  if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") return true;
  return Boolean(workerEnv()?.HYPERDRIVE || workerEnv()?.ASSETS);
}

/** Hyperdrive connection string for this request. Never log it. */
export function hyperdriveConnectionString(): string | undefined {
  const value = workerEnv()?.HYPERDRIVE?.connectionString?.trim();
  if (!value) return undefined;
  if (!value.startsWith("postgres://") && !value.startsWith("postgresql://")) return undefined;
  return value;
}

/** One short-lived client per checkout. The canon schema is not the copied public schema. */
export function hyperdrivePool(): Pool {
  return {
    async connect() {
      const connectionString = hyperdriveConnectionString();
      if (!connectionString) throw new Error("Production database is not configured.");
      const { Client } = await import("pg");
      const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
      try {
        await client.connect();
        await client.query("set search_path to canon");
      } catch {
        await client.end().catch(() => {});
        throw new Error("The database could not be reached.");
      }
      return Object.assign(client, {
        release: () => client.end().catch(() => undefined),
      });
    },
    async end() {
      return undefined;
    },
  } as unknown as Pool;
}
