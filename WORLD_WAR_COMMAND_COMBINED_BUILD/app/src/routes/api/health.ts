import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const sql = await getSql();
          const rows = await sql.query<{ tiles: number }>("select count(*)::int as tiles from territories");
          return Response.json({
            ok: true,
            tiles: rows[0]?.tiles ?? 0,
            purchases: false,
            ai: false,
          });
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
