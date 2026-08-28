import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { errorMessage, fieldErrors, sendData } from "../api/client";
import { Field } from "../components/ui";

export function PlatformRecoveryPage({ pathname }: { pathname: string }) {
  const client = useQueryClient();
  const isVerify = pathname.endsWith("verify-email");
  const isReset = pathname.endsWith("reset-password");
  const isRequestVerify = pathname.endsWith("request-verification");
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const errors = fieldErrors(error);
  const missingToken = (isVerify || isReset) && !token;
  const title = isVerify
    ? "Verify your email"
    : isReset
      ? "Choose a new password"
      : isRequestVerify
        ? "Protect your account"
        : "Forgot your password?";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const endpoint = pathname.split("/").at(-1)!;
      const result = await sendData<{ message: string }>(
        "post",
        `/platform/auth/${endpoint}`,
        isVerify ? { token } : isReset ? { token, password, confirmPassword } : { email },
      );
      setMessage(result.message);
      setPassword("");
      setConfirmPassword("");
      if (isReset) client.removeQueries({ queryKey: ["platform-principal"] });
      if (isVerify) await client.invalidateQueries({ queryKey: ["platform-principal"] });
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4 sm:p-8">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-10">
        <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <ShieldCheck size={28} />
        </span>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-blue-700">
          PHMS · Secure platform access
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isVerify
            ? "Confirm ownership of this email to enable password recovery. This does not create an account or sign you in."
            : isReset
              ? "Use at least 16 characters. A memorable passphrase works well. Your other platform sessions will be signed out."
              : isRequestVerify
                ? "Enter your registered platform email. We will send a verification link before you can reset your password."
                : "Enter your verified platform email to request a one-time reset link. Never share this link with anyone."}
        </p>
        {missingToken ? (
          <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
            No recovery link was found. Open the full link from your email, or request a new one
            below.
          </p>
        ) : message ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"
          >
            <CheckCircle2 className="mb-2" />
            {message}
            <p className="mt-2">
              {!isReset && !isVerify
                ? "Email may take a few minutes. If nothing arrives, check the address, verify it first, or contact your platform administrator."
                : ""}
            </p>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
            {!isVerify && !isReset && (
              <Field label="Platform email">
                <input
                  className="input w-full"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
            )}
            {isReset && (
              <>
                <Field label="New password">
                  <input
                    className="input w-full"
                    type="password"
                    autoComplete="new-password"
                    minLength={16}
                    maxLength={256}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-invalid={Boolean(errors["password"])}
                  />
                </Field>
                {errors["password"] && (
                  <p className="text-sm text-rose-700">{errors["password"]}</p>
                )}
                <Field label="Confirm new password">
                  <input
                    className="input w-full"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    aria-invalid={Boolean(errors["confirmPassword"])}
                  />
                </Field>
                {errors["confirmPassword"] && (
                  <p className="text-sm text-rose-700">{errors["confirmPassword"]}</p>
                )}
              </>
            )}
            {error !== null && (
              <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                {errorMessage(error)}
              </p>
            )}
            <button className="btn-primary w-full" type="submit" disabled={pending}>
              <Mail size={17} />
              {pending
                ? "Please wait…"
                : isVerify
                  ? "Confirm email ownership"
                  : isReset
                    ? "Save new password"
                    : "Send email link"}
            </button>
          </form>
        )}
        <div className="mt-7 flex flex-wrap gap-4 text-sm">
          <a
            href="/platform/login"
            className="inline-flex items-center gap-1 font-semibold text-blue-700"
          >
            <ArrowLeft size={15} /> Back to login
          </a>
          <a
            href={
              isVerify || isRequestVerify
                ? "/platform/forgot-password"
                : "/platform/request-verification"
            }
            className="text-slate-600 underline"
          >
            {isVerify || isRequestVerify ? "Request password reset" : "Verify my email first"}
          </a>
          {(isReset || isVerify) && (
            <a
              href={isVerify ? "/platform/request-verification" : "/platform/forgot-password"}
              className="text-slate-600 underline"
            >
              Request a new link
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
