import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-line bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-ledger text-lg font-semibold">{title}</h2>
            {subtitle ? <p className="text-muted mt-0.5 text-xs">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted rounded-md px-2 py-1 text-sm hover:bg-paper"
          >
            ✕
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function fieldClass(extra = ""): string {
  return `w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-brand ${extra}`;
}

export function LabelledField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-muted text-xs font-medium">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
