import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("up");
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
      setError(result.error.message || "Sign-in failed.");
      return;
    }
    const token = result.data && "token" in result.data ? result.data.token : null;
    if (token) window.sessionStorage.setItem("grok-auth.bearer-token", token);
    await navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="panel w-full max-w-md space-y-4 p-6">
        <p className="kicker">WORLD WAR COMMAND</p>
        <h1 className="font-display text-4xl leading-none">Enter the command</h1>
        <p className="text-sm text-[#cbbfa6]">
          This world uses a separate game database. Existing production accounts are not automatically imported.
          Purchases and external AI stay off. Password reset and verification letters are not sent until a mail provider is connected.
        </p>
        {authEnabled ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={mode === "up" ? "tab on" : "tab"} onClick={() => setMode("up")}>
                Register
              </button>
              <button type="button" className={mode === "in" ? "tab on" : "tab"} onClick={() => setMode("in")}>
                Log in
              </button>
            </div>
            <form className="space-y-3" onSubmit={submit}>
              {mode === "up" ? (
                <label className="block text-sm">
                  Commander name
                  <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
                </label>
              ) : null}
              <label className="block text-sm">
                Email
                <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label className="block text-sm">
                Password
                <input className="field" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              {error ? <p className="text-sm text-[#e7b2a8]">{error}</p> : null}
              <button className="btn w-full" type="submit" disabled={pending}>
                {pending ? "Working…" : mode === "up" ? "Create account" : "Log in"}
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
