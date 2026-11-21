"use client";
import { useState } from "react";
import { BRAND } from "@/lib/brand";
import { getSupabase } from "@/lib/supabase/client";
import { LOCALES, useI18n, useT } from "@/lib/i18n";
import { useApp } from "@/store/app";
import { Button, Field, Segmented, inputCls } from "./ui";

type Mode = "in" | "up" | "reset";

/** Sign in / create account / reset password (email + password, or Google) against Supabase Auth. Only rendered when Supabase is configured. */
export function AuthPanel({ recovery = false }: { recovery?: boolean }) {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const setLocale = useI18n((s) => s.setLocale);
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const finishRecovery = useApp((s) => s.finishRecovery);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = getSupabase()!;
    if (recovery) {
      const err = await finishRecovery(password);
      setBusy(false);
      if (err) setMsg({ kind: "error", text: err });
      return;
    }
    if (mode === "reset") {
      const res = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setBusy(false);
      // the same message whether or not the address has an account, so it can't be used to discover who is registered
      return setMsg(res.error ? { kind: "error", text: res.error.message } : { kind: "info", text: t("If that address has an account, a reset link is on its way. Open it on this device to choose a new password.") });
    }
    const res =
      mode === "in"
        ? await sb.auth.signInWithPassword({ email, password })
        : await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split("@")[0] }, emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) return setMsg({ kind: "error", text: res.error.message });
    if (mode === "up" && !res.data.session) setMsg({ kind: "info", text: t("Check your email to confirm your address, then sign in. Invitations are matched to your confirmed email.") });
  }

  async function google() {
    setMsg(null);
    setBusy(true);
    const { error } = await getSupabase()!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) {
      setBusy(false);
      setMsg({ kind: "error", text: /not enabled|unsupported provider/i.test(error.message) ? t("Google sign-in isn’t set up for this app yet.") : error.message });
    } // on success the browser is redirected to Google
  }

  const title = recovery ? t("Choose a new password") : mode === "reset" ? t("Reset your password") : null;

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-lg">
        <div>
          <h1 className="font-serif text-4xl text-accent">{BRAND.name}</h1>
          <p className="mt-1 text-muted">{title ?? t(BRAND.tagline)}</p>
        </div>

        {!recovery && mode !== "reset" && (
          <>
            <Segmented label={t("Mode")} value={mode} onChange={setMode} options={[{ value: "in", label: t("Sign in") }, { value: "up", label: t("Create account") }]} />
            <Button className="w-full" onClick={() => void google()} disabled={busy}>
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9a6.1 6.1 0 0 1 0-12.2c1.9 0 3.2.8 3.9 1.5l2.7-2.6A9.8 9.8 0 0 0 12 2.2a9.8 9.8 0 1 0 0 19.6c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-2z" /></svg>
              {t("Continue with Google")}
            </Button>
            <div className="flex items-center gap-3 text-sm text-muted" aria-hidden><span className="h-px flex-1 bg-line" />{t("or")}<span className="h-px flex-1 bg-line" /></div>
          </>
        )}

        {mode === "up" && !recovery && <Field label={t("Name")} htmlFor="n"><input id="n" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        {!recovery && <Field label={t("Email")} htmlFor="e"><input id="e" type="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>}
        {(recovery || mode !== "reset") && (
          <Field label={recovery ? t("New password") : t("Password")} htmlFor="p" hint={recovery || mode === "up" ? t("At least 8 characters.") : undefined}>
            <input id="p" type="password" required minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" && !recovery ? "current-password" : "new-password"} />
          </Field>
        )}
        {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "text-sm text-danger" : "text-sm text-muted"}>{msg.text}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? t("One moment…") : recovery ? t("Save password") : mode === "reset" ? t("Send reset link") : mode === "in" ? t("Sign in") : t("Create account")}
        </Button>
        {!recovery && mode === "in" && <button type="button" onClick={() => { setMode("reset"); setMsg(null); }} className="-mb-2 inline-flex min-h-11 w-full items-center justify-center text-[15px] text-accent hover:underline">{t("Forgot your password?")}</button>}
        <div className="flex justify-center pt-1"><Segmented label={t("Language")} value={locale} onChange={setLocale} options={LOCALES.map((l) => ({ value: l.value, label: l.label }))} /></div>
        {!recovery && mode === "reset" && <button type="button" onClick={() => { setMode("in"); setMsg(null); }} className="-mb-2 inline-flex min-h-11 w-full items-center justify-center text-[15px] text-accent hover:underline">{t("Back to sign in")}</button>}
      </form>
    </main>
  );
}
