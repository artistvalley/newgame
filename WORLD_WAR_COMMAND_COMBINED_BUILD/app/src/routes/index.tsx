import { createFileRoute, Link } from "@tanstack/react-router";
import { Command } from "@/components/wwc/Command";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md space-y-4 text-center">
          <div className="wwc-spinner mx-auto" aria-hidden />
          <p className="kicker">World War Command</p>
          <h1 className="font-display text-4xl leading-none">Opening the war room…</h1>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-5 py-12">
        <p className="kicker">WORLD WAR COMMAND · free strategy game</p>
        <h1 className="font-display text-5xl leading-none sm:text-7xl">Build a nation. Command the world.</h1>
        <p className="max-w-xl text-lg text-[#d9d0bf]">
          Claim land on a shared 14×14 world map, grow your economy, research new ideas, make treaties
          with other players and defend your borders. Free to play — no real money.
        </p>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Create a free account", "Just a name, email and password."],
            ["2", "Found your country", "Pick up to 6 land squares and give it a name."],
            ["3", "Play your turns", "Set budgets, recruit an army, sign treaties."],
          ].map(([n, title, text]) => (
            <li key={n} className="panel flex gap-3 p-4">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f5c85b] font-bold text-[#17233a]">{n}</span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-[#cbd5e3]">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/login" search={{ mode: "up" }} className="btn w-full px-8 text-lg sm:w-auto">
            Play now — it’s free
          </Link>
          <Link to="/login" search={{ mode: "in" }} className="tab w-full px-8 sm:w-auto">
            I already have an account
          </Link>
        </div>
      </main>
    );
  }

  return <Command />;
}