"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OtpVerificationStageProps {
  email: string;
  isLoading: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Mock OTP entry — accepts any complete 6-digit code, same "valid once the
 * shape is right" rigor as `MicrosoftSsoForm`/`CreateAccountForm`. Only
 * reached from the password signup path; Microsoft/Google already assert a
 * verified email as part of their OAuth handshake, so those skip this step.
 */
export function OtpVerificationStage({ email, isLoading, onVerify, onResend }: OtpVerificationStageProps) {
  const t = useTranslations("onboardingSignup.otp");
  const [digits, setDigits] = React.useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (index: number, rawValue: string) => {
    const value = rawValue.replace(/\D/g, "").slice(-1);
    setDigits((prev) => prev.map((digit, i) => (i === index ? value : digit)));
    setError(null);
    if (value && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    setDigits((prev) => prev.map((digit, i) => pasted[i] ?? digit));
    setError(null);
    inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleVerify = (event: React.FormEvent) => {
    event.preventDefault();
    const code = digits.join("");
    if (code.length < CODE_LENGTH) {
      setError(t("incompleteCode"));
      return;
    }
    setError(null);
    onVerify(code);
  };

  const handleResend = () => {
    onResend();
    setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  return (
    <form className="flex flex-col items-center gap-4 text-center" onSubmit={handleVerify}>
      <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("description", { email })}</p>

      <div className="flex flex-col items-center gap-1.5">
        <Label htmlFor="otp-digit-0" className="sr-only">
          {t("codeLabel")}
        </Label>
        <div className="flex justify-center gap-2">
          {digits.map((digit, index) => (
            <Input
              key={index}
              id={`otp-digit-${index}`}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              className="h-12 w-10 p-0 text-center text-lg font-semibold"
            />
          ))}
        </div>
        {error ? <p className="text-[12.5px] text-destructive">{error}</p> : null}
      </div>

      <Button type="submit" size="block" disabled={isLoading}>
        {isLoading ? t("verifying") : t("verifyButton")}
      </Button>

      <Button type="button" variant="ghost" size="sm" disabled={cooldown > 0 || isLoading} onClick={handleResend}>
        {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
      </Button>
    </form>
  );
}
