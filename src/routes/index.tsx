import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { QuitsMark } from "@/components/quits/QuitsMark";
import { api } from "@/lib/api";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { ApiError } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quits — split shared costs with friends, no accounts" },
      {
        name: "description",
        content:
          "Create a group, share one link, add expenses. Quits shows who owes whom and the shortest set of payments that clears everyone out.",
      },
      { property: "og:title", content: "Quits — split shared costs with friends" },
      {
        property: "og:description",
        content:
          "Create a group, share one link, add expenses. Quits shows the shortest set of payments that clears everyone out.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = name.trim();
  const canCreate = trimmed.length >= 1 && trimmed.length <= 60 && !busy;

  async function createGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    try {
      const { code } = await api.createGroup(trimmed, currency);
      void navigate({ to: "/g/$code", params: { code } });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not create the group");
      setBusy(false);
    }
  }

  function join(event: React.FormEvent) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 8) {
      toast.error("A group code is 8 characters");
      return;
    }
    void navigate({ to: "/g/$code", params: { code } });
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <QuitsMark />
            <div>
              <p className="font-ledger text-xl leading-none font-semibold">Quits</p>
              <p className="text-muted-foreground mt-1 text-xs">Split it, settle it.</p>
            </div>
          </div>
        </header>

        <section className="mt-12 grid grid-cols-12 gap-10">
          <div className="col-span-12 lg:col-span-6">
            <p className="text-brand text-xs font-semibold tracking-[0.18em] uppercase">
              No accounts, no passwords
            </p>
            <h1 className="font-ledger mt-4 text-5xl leading-[1.05] font-semibold sm:text-6xl">
              Work out who owes whom, then stop talking about it.
            </h1>
            <p className="text-muted-foreground mt-5 max-w-lg text-sm leading-relaxed">
              Start a group for the trip, the villa, the dinner series. Share one link. Everyone
              adds what they paid, and Quits works out the shortest set of payments that clears
              the whole group out.
            </p>
            <p className="text-muted-foreground mt-6 border-t border-line pt-5 text-xs">
              Quits records that a payment happened. It never moves money.
            </p>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <form
              onSubmit={createGroup}
              className="rounded-xl border border-line bg-card p-6 shadow-sm"
            >
              <h2 className="font-ledger text-lg font-semibold">Start a group</h2>

              <label className="mt-5 block">
                <span className="text-muted-foreground text-xs font-medium">Group name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  placeholder="Porto trip"
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-muted-foreground text-xs font-medium">Currency</span>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand"
                >
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                One currency per group, chosen now and fixed afterwards. Only currencies with two
                decimal places are supported, so JPY, KRW and KWD aren&apos;t in the list.
              </p>

              <button
                type="submit"
                disabled={!canCreate}
                className="mt-5 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Creating…" : "Create group"}
              </button>
            </form>

            <form onSubmit={join} className="mt-4 flex items-end gap-2">
              <label className="flex-1">
                <span className="text-muted-foreground text-xs font-medium">Already have a code?</span>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  maxLength={8}
                  placeholder="7K4M2Q9B"
                  className="tnum mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm tracking-[0.14em] outline-none focus:border-brand"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg border border-line bg-card px-4 py-2.5 text-sm font-semibold"
              >
                Open
              </button>
            </form>
          </div>
        </section>

        <footer className="text-muted-foreground mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs">
          <p>Integer minor units only · no floats, ever.</p>
          <p>Anyone with the link can see and edit the group.</p>
        </footer>
      </div>
    </div>
  );
}
