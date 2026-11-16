import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

type GameResult = {
  ok: boolean;
  error?: string;
};

async function call(fn: string, params: unknown[]): Promise<GameResult> {
  const sql = await getSql();
  const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
  const rows = await sql.query<{ result: GameResult }>(
    `select ${fn}(${placeholders}) as result`,
    params,
  );
  return rows[0]?.result ?? { ok: false, error: "No result." };
}

export const getWorld = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => call("wwc_state", [context.userId]));

export const foundCountry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    name: string;
    government: string;
    flagPrimary: string;
    flagSecondary: string;
    flagSymbol: string;
    territories: string[];
    idempotencyKey: string;
  }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_found_country", [
      context.userId,
      data.name,
      data.government,
      data.flagPrimary,
      data.flagSecondary,
      data.flagSymbol,
      data.territories,
      data.idempotencyKey,
    ]),
  );

export const setBudget = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    tax: number;
    agri: number;
    industry: number;
    infra: number;
    reserves: number;
    idempotencyKey: string;
  }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_set_budget", [
      context.userId,
      data.tax,
      data.agri,
      data.industry,
      data.infra,
      data.reserves,
      data.idempotencyKey,
    ]),
  );

export const advanceTick = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { idempotencyKey: string }) => input)
  .handler(async ({ data, context }) => call("wwc_advance_tick", [context.userId, data.idempotencyKey]));

export const startResearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { title: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_start_research", [context.userId, data.title, data.idempotencyKey]),
  );

export const recruitUnit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) => call("wwc_recruit", [context.userId, data.name, data.idempotencyKey]));

export const fight = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { target: string; posture: string; training: boolean; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_attack", [context.userId, data.target, data.posture, data.training, data.idempotencyKey]),
  );

export const rehabilitate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { idempotencyKey: string }) => input)
  .handler(async ({ data, context }) => call("wwc_rehabilitate", [context.userId, data.idempotencyKey]));

export const moveCapital = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { target: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_move_capital", [context.userId, data.target, data.idempotencyKey]),
  );

export const proposeTreaty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { targetId: string; kind: string; body: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_propose", [context.userId, data.targetId, data.kind, data.body, data.idempotencyKey]),
  );

export const answerTreaty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agreementId: string; accept: boolean; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_answer_treaty", [context.userId, data.agreementId, data.accept, data.idempotencyKey]),
  );

export const creditZetos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { amount: number; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_credit_zetos", [context.userId, data.amount, data.idempotencyKey]),
  );

export const counterattack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { target: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_counterattack", [context.userId, data.target, data.idempotencyKey]),
  );

export const cancelTreaty = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { agreementId: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_cancel_treaty", [context.userId, data.agreementId, data.idempotencyKey]),
  );

export const debitZetos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { amount: number; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_debit_zetos", [context.userId, data.amount, data.idempotencyKey]),
  );

export const refundZetos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { ledgerId: string; idempotencyKey: string }) => input)
  .handler(async ({ data, context }) =>
    call("wwc_refund_zetos", [context.userId, data.ledgerId, data.idempotencyKey]),
  );

export const spectate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => call("wwc_spectate", [context.userId]));

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => call("wwc_admin_overview", [context.userId]));
