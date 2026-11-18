import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { getMailConfigured } from "@/lib/auth/mail-status";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { mode?: "in" | "up" } =>
    search.mode === "in" || search.mode === "up" ? { mode: search.mode } : {},
  loader: () => getMailConfigured(),
  component: Login,
});

function Login() {
  const { mailConfigured } = Route.useLoaderData();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name: name || email, callbackURL: "/" })
        : await authClient.signIn.email({ email, password, callbackURL: "/" });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error.message, mode));
      return;
    }
    const token = result.data && "token" in result.data ? result.data.token : null;
    if (token) window.sessionStorage.setItem("grok-auth.bearer-token", token);
    await navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="panel w-full max-w-md space-y-4 p-6">
        <Link to="/" className="kicker inline-flex min-h-11 items-center">← WORLD WAR COMMAND</Link>
        <h1 className="font-display text-4xl leading-none">{mode === "up" ? "Create your commander" : "Welcome back"}</h1>
        <p className="text-sm text-[#cbbfa6]">
          {mode === "up"
            ? "Free to play. Pick a commander name, then you will found your country on the map."
            : "Log in to return to your country."}
          {mailConfigured ? "" : " Password reset by email is not available yet, so keep your password safe."}
        </p>
        {authEnabled ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={mode === "up" ? "tab on" : "tab"} aria-pressed={mode === "up"} onClick={() => { setMode("up"); setError(""); }}>
                Register
              </button>
              <button type="button" className={mode === "in" ? "tab on" : "tab"} aria-pressed={mode === "in"} onClick={() => { setMode("in"); setError(""); }}>
                Log in
              </button>
            </div>
            <form className="space-y-3" onSubmit={submit}>
              {mode === "up" ? (
                <label className="block text-sm">
                  Commander name
                  <input className="field" value={name} autoComplete="nickname" placeholder="e.g. General Asha" onChange={(event) => setName(event.target.value)} required />
                </label>
              ) : null}
              <label className="block text-sm">
                Email
                <input className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label className="block text-sm">
                Password
                <input className="field" type="password" minLength={8} autoComplete={mode === "up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required />
                {mode === "up" ? <span className="mt-1 block text-xs text-[#9fb0c6]">At least 8 characters.</span> : null}
              </label>
              {error ? <p role="alert" className="rounded-lg bg-[#3d1a1a] p-3 text-sm text-[#ffd9d2]">⚠️ {error}</p> : null}
              <button className="btn w-full" type="submit" disabled={pending}>
                {pending ? (mode === "up" ? "Creating your account…" : "Logging in…") : mode === "up" ? "Create account & play" : "Log in"}
              </button>
            </form>
            <div className="space-y-2">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  className="tab w-full"
                  onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                >
                  Continue with {provider.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p>Sign-in is disabled.</p>
        )}
      </div>
    </main>
  );
}

function friendlyAuthError(message: string | undefined, mode: "in" | "up"): string {
  const text = (message || "").toLowerCase();
  if (text.includes("already") || text.includes("exists")) return "That email already has an account. Tap “Log in” above instead.";
  if (text.includes("invalid email or password") || text.includes("invalid password") || text.includes("credential"))
    return "The email or password is not right. Check them and try again.";
  if (text.includes("password") && (text.includes("short") || text.includes("least"))) return "Your password needs at least 8 characters.";
  if (text.includes("email") && text.includes("invalid")) return "That email address does not look right.";
  if (text.includes("fetch") || text.includes("network")) return "Could not reach the game server. Check your connection and try again.";
  return message || (mode === "up" ? "Could not create the account. Please try again." : "Could not log in. Please try again.");
}
