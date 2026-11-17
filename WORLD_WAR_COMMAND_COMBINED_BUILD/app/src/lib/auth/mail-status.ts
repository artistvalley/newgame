import { createServerFn } from "@tanstack/react-start";

/** Client-safe probe: whether verification/reset mail can actually be sent. */
export const getMailConfigured = createServerFn({ method: "GET" }).handler(
  async () => {
    const { isMailConfigured } = await import("./mail.server.ts");
    return { mailConfigured: isMailConfigured() };
  },
);
