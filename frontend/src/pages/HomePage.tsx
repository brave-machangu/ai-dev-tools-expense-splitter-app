import { useState, type FormEvent } from "react";

import { api, errorMessage, mockTools } from "../api/client";
import { Link } from "../components/Link";
import { SUPPORTED_CURRENCIES } from "../domain/money";
import { groupPath, navigate } from "../lib/router";

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export function HomePage() {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const [resetState, setResetState] = useState<"idle" | "working" | "done">("idle");

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const result = await api.createGroup({ name, currency });
      navigate(groupPath(result.code));
    } catch (error) {
      setCreateError(errorMessage(error));
      setCreating(false);
    }
  };

  const openByCode = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = code
      .trim()
      .toUpperCase()
      .replace(/^.*\/G\//, "");
    if (!CODE_PATTERN.test(cleaned)) {
      setCodeError("A group code is 8 letters and digits, like TR1P2026.");
      return;
    }
    navigate(groupPath(cleaned));
  };

  const resetSample = async () => {
    setResetState("working");
    await mockTools.resetData();
    setResetState("done");
  };

  return (
    <div className="home">
      <section className="hero">
        <h1 className="hero-title">Split the trip, not the friendship.</h1>
        <p className="hero-lede">
          Make a group, share the link, and everyone adds what they paid. Quits works out who owes
          whom — and the fewest payments to settle up.
        </p>
      </section>

      <div className="home-grid">
        <section className="card">
          <h2 className="section-title">Start a group</h2>
          <form className="stack" onSubmit={createGroup}>
            <label className="field">
              <span className="field-label">Group name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lisbon weekend"
                maxLength={60}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Currency</span>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Fixed once the group is created. Only currencies with two decimal places are
                supported, so JPY, KRW, KWD and similar aren't available.
              </span>
            </label>
            {createError && <p className="form-error">{createError}</p>}
            <button className="btn btn-primary" type="submit" disabled={creating || !name.trim()}>
              {creating ? "Creating…" : "Create group"}
            </button>
          </form>
        </section>

        <div className="stack">
          <section className="card card-accent">
            <h2 className="section-title">Try the sample group</h2>
            <p className="muted">
              “Lisbon weekend” — four friends, five expenses and one payment already recorded.
            </p>
            <div className="row">
              <Link to={groupPath(mockTools.sampleGroupCode)} className="btn btn-primary">
                Open sample group
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetSample}
                disabled={resetState === "working"}
              >
                {resetState === "working" ? "Resetting…" : "Reset sample data"}
              </button>
            </div>
            {resetState === "done" && (
              <p className="small muted" role="status">
                Mock data restored to the original sample.
              </p>
            )}
          </section>

          <section className="card">
            <h2 className="section-title">Got a link or code?</h2>
            <form className="row row-nowrap" onSubmit={openByCode}>
              <input
                className="input input-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(null);
                }}
                placeholder="TR1P2026"
                aria-label="Group code or link"
              />
              <button className="btn btn-secondary" type="submit" disabled={!code.trim()}>
                Open
              </button>
            </form>
            {codeError && <p className="form-error">{codeError}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
