import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LuTriangleAlert } from "react-icons/lu";

import { ERASURE_GRACE_PERIOD_DAYS } from "@/app/_libs/constants/erasure";
import { ROUTES } from "@/app/_libs/constants/routes";
import type { DeleteAccountResult } from "@/app/_libs/services/auth.service";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDownloadTenantExport } from "@/hooks/settings/use-download-tenant-export";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

const OTP_RESEND_COOLDOWN_SECONDS = 60;
const DATE_FORMAT = { month: "long", day: "numeric", year: "numeric" } as const;

/**
 * Two-phase delete (grace period, restorable). Re-auth is the password, or an emailed code for SSO owners. The session
 * is already dead on success, so the dialog ends on a non-dismissable screen whose only exit is sign-in.
 */
export function DeleteBusinessSection() {
  const t = useTranslations("settings.general.deleteBusiness");
  const format = useFormatter();
  const { profile, requestDeleteAccountOtp, deleteAccount } = useTenantOwnerProfile();
  const exportData = useDownloadTenantExport();

  const [open, setOpen] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scheduled, setScheduled] = useState<DeleteAccountResult | null>(null);

  // Keyed on whether a countdown is running, not its value (see `AddPasswordForm`).
  const cooldownActive = cooldown > 0;
  useEffect(() => {
    if (!cooldownActive) return;
    const timer = setInterval(() => setCooldown((prev) => Math.max(prev - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldownActive]);

  // Once scheduled the dialog must outlive the profile: the session is gone and the profile query
  // may fail or be cleared at any moment, but the owner still needs to read the confirmation.
  if (scheduled === null && (!profile || profile.role !== "owner")) return null;

  const usesPassword = profile?.hasPassword ?? true;
  const businessLabel = profile?.businessName ?? "";
  const nameMatches = businessName.trim() === businessLabel.trim();
  const hasProof = usesPassword ? password.length > 0 : /^\d{6}$/.test(otp);
  const canSubmit = nameMatches && hasProof && !isDeleting && scheduled === null;

  const reset = () => {
    setBusinessName("");
    setPassword("");
    setOtp("");
    setOtpRequested(false);
    setCooldown(0);
  };

  const handleOpenChange = (next: boolean) => {
    // Once scheduled there is nothing left to dismiss back to: the session is gone.
    if (scheduled) return;
    if (isDeleting) return;
    setOpen(next);
    if (!next) reset();
  };

  const sendOtp = async () => {
    setIsSendingOtp(true);
    try {
      if (await requestDeleteAccountOtp()) {
        setOtpRequested(true);
        setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const submit = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAccount({
        businessName: businessName.trim(),
        ...(usesPassword ? { password } : { otp }),
      });
      if (result) {
        // The secrets have done their job; do not hold them in state while the confirmation shows.
        setPassword("");
        setOtp("");
        setScheduled(result);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-destructive/40 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <LuTriangleAlert className="size-4" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
            {t("open")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={scheduled === null}
          onEscapeKeyDown={(event) => {
            if (scheduled) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (scheduled) event.preventDefault();
          }}>
          {scheduled ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("done.title")}</DialogTitle>
                <DialogDescription>
                  {t("done.description", {
                    date: format.dateTime(new Date(scheduled.scheduledFor), DATE_FORMAT),
                    days: scheduled.gracePeriodDays,
                  })}
                </DialogDescription>
              </DialogHeader>
              <p className="text-muted-foreground text-[13px]">
                {scheduled.canRestore ? t("done.canRestore") : t("done.contactSupport")}
              </p>
              <DialogFooter>
                <Button type="button" onClick={() => window.location.assign(ROUTES.LOGIN)}>
                  {t("done.backToSignIn")}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) void submit();
              }}
              noValidate>
              <DialogHeader>
                <DialogTitle>{t("dialog.title")}</DialogTitle>
                <DialogDescription>{t("dialog.description")}</DialogDescription>
              </DialogHeader>

              <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-[13px]">
                <li>{t("dialog.consequences.suspended")}</li>
                <li>{t("dialog.consequences.billing")}</li>
                <li>{t("dialog.consequences.erased", { days: ERASURE_GRACE_PERIOD_DAYS })}</li>
                <li>{usesPassword ? t("dialog.consequences.restore") : t("dialog.consequences.noRestore")}</li>
              </ul>

              <div className="flex flex-col items-start gap-1">
                <p className="text-muted-foreground text-[13px]">{t("dialog.exportHint")}</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  disabled={exportData.isPending}
                  onClick={() => exportData.mutate()}>
                  {exportData.isPending ? t("dialog.exporting") : t("dialog.exportFirst")}
                </Button>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="delete-business-name">
                  {t("dialog.nameLabel", { name: businessLabel })}
                </Label>
                <Input
                  id="delete-business-name"
                  autoComplete="off"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                />
              </div>

              {usesPassword ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-business-password">{t("dialog.passwordLabel")}</Label>
                  <PasswordInput
                    id="delete-business-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delete-business-otp">{t("dialog.otpLabel")}</Label>
                  {otpRequested ? (
                    <Input
                      id="delete-business-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                    />
                  ) : (
                    <p className="text-muted-foreground text-[13px]">{t("dialog.otpHint")}</p>
                  )}
                  <Button
                    type="button"
                    variant={otpRequested ? "link" : "outline"}
                    size="sm"
                    className={otpRequested ? "h-auto w-fit p-0" : "w-fit"}
                    disabled={cooldown > 0 || isSendingOtp}
                    onClick={() => void sendOtp()}>
                    {isSendingOtp
                      ? t("dialog.sendingCode")
                      : cooldown > 0
                        ? t("dialog.resendCodeIn", { seconds: cooldown })
                        : otpRequested
                          ? t("dialog.resendCode")
                          : t("dialog.sendCode")}
                  </Button>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isDeleting}>
                  {t("dialog.cancel")}
                </Button>
                <Button type="submit" variant="destructive" disabled={!canSubmit}>
                  {isDeleting ? t("dialog.deleting") : t("dialog.confirm")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
