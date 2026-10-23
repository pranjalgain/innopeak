"use client";

import { useTranslations } from "next-intl";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OtpVerificationStageProps {
  email: string;
  isLoading: boolean;
  /** Resolves `false` when the code was rejected, so the boxes clear for a retry; anything else (success, navigation) leaves them. */
  onVerify: (code: string) => void | boolean | Promise<void | boolean>;
  onResend: () => void;
  /** Offered only where starting over is meaningful (the signup wizard) — renders a "use a different email" link. */
  onChangeEmail?: () => void;
  /** Which copy to render; defaults to the signup wizard's strings, pass another namespace (same key shape) for e.g. login wording. */
  translationNamespace?: string;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;
const DEFAULT_TRANSLATION_NAMESPACE = "onboardingSignup.otp";

/** Shared by the signup wizard's "otp" step and login's (an existing account that never finished verifying). Microsoft/Google assert a verified email, so they skip it. */
export function OtpVerificationStage({
  email,
  isLoading,
  onVerify,
  onResend,
  onChangeEmail,
  translationNamespace = DEFAULT_TRANSLATION_NAMESPACE,
}: OtpVerificationStageProps) {
  const t = useTranslations(translationNamespace);
  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (index: number, rawValue: string) => {
    const typed = rawValue.replace(/\D/g, "");
    // More than one new character at once is not typing: it is an OS or password-manager autofill of the whole code, which lands in
    // whichever box has focus. Spread it from that box instead of keeping its last digit.
    if (typed.length > 2) {
      const filled = typed.slice(0, CODE_LENGTH - index);
      setDigits((prev) => prev.map((digit, i) => (i >= index ? (filled[i - index] ?? digit) : digit)));
      setError(null);
      inputRefs.current[Math.min(index + filled.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    const value = typed.slice(-1);
    setDigits((prev) => prev.map((digit, i) => (i === index ? value : digit)));
    setError(null);
    if (value && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setDigits((prev) => prev.map((digit, i) => pasted[i] ?? digit));
    setError(null);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    const code = digits.join("");
    if (code.length < CODE_LENGTH) {
      setError(t("incompleteCode"));
      return;
    }
    setError(null);
    if ((await onVerify(code)) === false) {
      // A wrong code would otherwise have to be erased box by box: a filled box ignores further typing.
      setDigits(Array(CODE_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = () => {
    onResend();
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  return (
    <form className="flex flex-col items-center gap-4 text-center" onSubmit={handleVerify}>
      <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">{t("description", { email })}</p>

      <div className="flex flex-col items-center gap-1.5">
        <Label htmlFor="otp-digit-0" className="sr-only">
          {t("codeLabel")}
        </Label>
        <div className="flex justify-center gap-2" role="group" aria-label={t("codeLabel")}>
          {digits.map((digit, index) => (
            <Input
              key={index}
              id={`otp-digit-${index}`}
              aria-label={`${t("codeLabel")} ${index + 1} / ${CODE_LENGTH}`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "otp-error" : undefined}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              // No `maxLength`: a cap of one character made the browser truncate an autofilled code to its first digit (see `handleChange`).
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              className="h-12 w-9 p-0 text-center text-lg font-semibold min-[360px]:w-10"
            />
          ))}
        </div>
        {error ? (
          <p id="otp-error" role="alert" className="text-destructive text-[12.5px]">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="block" disabled={isLoading}>
        {isLoading ? t("verifying") : t("verifyButton")}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={cooldown > 0 || isLoading}
        onClick={handleResend}>
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
      </Button>

      {onChangeEmail ? (
        <Button type="button" variant="link" size="sm" disabled={isLoading} onClick={onChangeEmail}>
          {t("changeEmail")}
        </Button>
      ) : null}
    </form>
  );
}
