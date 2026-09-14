import { useState } from "react";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

/** Two-step destructive action without a browser confirm() dialog. */
export function ConfirmButton({
  label,
  confirmLabel = "Yes, delete",
  onConfirm,
  disabled = false,
  className = "btn btn-danger-ghost",
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="confirm-group" role="group" aria-label="Confirm">
      <span className="small muted">Sure?</span>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={disabled}
        onClick={() => {
          setArmed(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
