"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import clsx from "clsx";
import { X } from "lucide-react";
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { useApp } from "@/store/app";

type Variant = "primary" | "outline" | "ghost" | "danger" | "soft";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-110 active:brightness-95",
  outline: "border border-line text-fg hover:bg-surface-2 active:bg-surface",
  ghost: "text-fg hover:bg-surface-2",
  soft: "bg-surface-2 text-fg hover:bg-line",
  danger: "border border-danger/50 text-danger hover:bg-danger/10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }>(
  function Button({ variant = "outline", small, className, type = "button", ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        {...p}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-xl px-4 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-45",
          small ? "min-h-11 px-3 text-sm" : "min-h-11",
          VARIANTS[variant],
          className,
        )}
      />
    );
  },
);

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant; bare?: boolean }>(
  function IconButton({ label, variant = "outline", bare, className, type = "button", children, ...p }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        {...p}
        className={clsx(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40",
          bare ? "text-fg hover:bg-white/10" : VARIANTS[variant],
          className,
        )}
      >
        {children}
      </button>
    );
  },
);

export const inputCls =
  "w-full min-h-11 rounded-xl border border-line bg-bg px-3 text-[15px] text-fg placeholder:text-muted/70 focus:border-accent disabled:opacity-50";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Modal sheet: bottom sheet on phones, centred dialog on larger screens. Focus is trapped; Escape closes. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  full,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Full-screen on phones (editors). */
  full?: boolean;
}) {
  const t = useT();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/65" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={clsx(
            "sheet-in fixed z-50 flex flex-col border-line bg-surface outline-none",
            full ? "inset-0 rounded-none" : "inset-x-0 bottom-0 top-10 rounded-t-2xl border-x border-t",
            "md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[88dvh] md:w-[calc(100%-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border",
            wide ? "md:max-w-3xl" : "md:max-w-lg",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 md:px-5 md:py-4">
            <div>
              <Dialog.Title className="text-xl font-semibold leading-snug">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label={t("Close")} variant="ghost" className="-mr-2 -mt-1">
                <X size={20} />
              </IconButton>
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5">{children}</div>
          {footer && <footer className="pb-safe flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-4 py-3 md:px-5">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation for destructive actions. */
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
        <AlertDialog.Content className="sheet-in fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 outline-none">
          <AlertDialog.Title className="text-xl font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-[15px] text-muted">{description}</div>
          </AlertDialog.Description>
          {children}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">{t("Cancel")}</Button>
            </AlertDialog.Cancel>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  onOpenChange(false);
                }
              }}
            >
              {confirmLabel ?? t("Delete")}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const t = useT();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom,0px)+0.75rem)] z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6" role="region" aria-label={t("Notifications")}>
      {toasts.map((ts) => (
        <div
          key={ts.id}
          role={ts.kind === "error" ? "alert" : "status"}
          className={clsx(
            "toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-[15px] ",
            ts.kind === "error" ? "border-danger/60 bg-surface-2 text-fg" : "border-line bg-surface-2 text-fg",
          )}
        >
          <span className="flex-1">{ts.message}</span>
          {ts.action && (
            <button
              className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-white/10"
              onClick={async () => {
                dismiss(ts.id);
                await ts.action!.run();
              }}
            >
              {ts.action.label}
            </button>
          )}
          <button aria-label={t("Dismiss")} className="rounded-lg p-1 text-muted hover:bg-white/10" onClick={() => dismiss(ts.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("min-h-11 rounded-lg px-3 text-sm transition-colors", value === o.value ? "bg-accent text-accent-ink font-semibold" : "text-fg hover:bg-surface-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Spinner() {
  const t = useT();
  return <div className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" role="status" aria-label={t("Loading")} />;
}
