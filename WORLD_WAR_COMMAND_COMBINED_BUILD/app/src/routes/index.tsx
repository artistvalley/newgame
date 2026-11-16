import { createFileRoute, Link } from "@tanstack/react-router";
import { Command } from "@/components/wwc/Command";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="max-w-md space-y-3 text-center">
          <p className="kicker">World War Command</p>
          <h1 className="font-display text-5xl leading-none">Opening the war room</h1>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-5 py-16">
        <p className="kicker">WORLD WAR COMMAND · 14×14 WORLD</p>
        <h1 className="font-display text-6xl leading-none sm:text-7xl">World War Command</h1>
        <p className="max-w-xl text-lg text-[#d9d0bf]">
          Found a country on the shared map. The server keeps the treasury, the battles and the land.
          The browser only sends what you intend to do.
        </p>
        <Link to="/login" className="btn w-fit">
          Register or log in
        </Link>
      </main>
    );
  }

  return <Command />;
}