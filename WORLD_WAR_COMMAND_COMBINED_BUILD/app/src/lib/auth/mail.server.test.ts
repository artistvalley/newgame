import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isMailConfigured, sendAppMail } from "./mail.server.ts";

const KEYS = ["SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;
const saved: Record<string, string | undefined> = {};

function stash() {
  for (const key of KEYS) saved[key] = process.env[key];
}
function restore() {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

describe("mail sending", () => {
  afterEach(restore);

  it("is not configured when SMTP_PASS is missing", () => {
    stash();
    process.env.SMTP_USER = "hostwhale@gmail.com";
    delete process.env.SMTP_PASS;
    assert.equal(isMailConfigured(), false);
  });

  it("is configured when SMTP_USER and SMTP_PASS are set", () => {
    stash();
    process.env.SMTP_USER = "hostwhale@gmail.com";
    process.env.SMTP_PASS = "not-a-real-password";
    assert.equal(isMailConfigured(), true);
  });

  it("skips sending without crashing when SMTP_PASS is missing", async () => {
    stash();
    process.env.SMTP_USER = "hostwhale@gmail.com";
    delete process.env.SMTP_PASS;
    await sendAppMail({
      to: "player@example.com",
      subject: "test",
      text: "test",
      html: "<p>test</p>",
    });
  });
});
