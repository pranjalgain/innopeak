"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CreateAccountFormValues {
  name: string;
  businessName: string;
  email: string;
  password: string;
}

interface CreateAccountFormProps {
  isLoading: boolean;
  onSubmit: (values: CreateAccountFormValues) => void;
}

/**
 * Signup's own account-creation form — deliberately not shared with login's
 * `PasswordAuthForm`: login never needs a name field or this much
 * validation for an account that already exists. The password checklist
 * and the confirm-password mismatch message only appear once their field
 * has been blurred at least once and has a value — not on the very first
 * keystroke — then update live as the user keeps editing, and the checklist
 * disappears again once every requirement is met.
 */
export function CreateAccountForm({ isLoading, onSubmit }: CreateAccountFormProps) {
  const t = useTranslations("onboardingSignup.createAccount");
  const [name, setName] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [passwordBlurred, setPasswordBlurred] = React.useState(false);
  const [confirmBlurred, setConfirmBlurred] = React.useState(false);

  const requirements = checkPasswordRequirements(password);
  const passwordValid = passwordMeetsRequirements(requirements);
  const hasConfirmValue = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  const showRequirements = passwordBlurred && password.length > 0 && !passwordValid;
  const showMismatch = confirmBlurred && hasConfirmValue && !passwordsMatch;

  const canSubmit =
    name.trim() !== "" &&
    businessName.trim() !== "" &&
    email.trim() !== "" &&
    passwordValid &&
    passwordsMatch &&
    hasConfirmValue &&
    !isLoading;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit({ name, businessName, email, password });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-name">{t("nameLabel")}</Label>
        <Input
          id="signup-name"
          type="text"
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-business-name">{t("businessNameLabel")}</Label>
        <Input
          id="signup-business-name"
          type="text"
          placeholder={t("businessNamePlaceholder")}
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          autoComplete="organization"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-email">{t("emailLabel")}</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-password">{t("passwordLabel")}</Label>
        <PasswordInput
          id="signup-password"
          placeholder={t("passwordLabel")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onBlur={() => setPasswordBlurred(true)}
          autoComplete="new-password"
        />
        {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signup-confirm-password">{t("confirmPasswordLabel")}</Label>
        <PasswordInput
          id="signup-confirm-password"
          placeholder={t("confirmPasswordLabel")}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() => setConfirmBlurred(true)}
          autoComplete="new-password"
        />
        {showMismatch ? <p className="text-[12.5px] text-destructive">{t("passwordMismatch")}</p> : null}
      </div>

      <Button type="submit" size="block" disabled={!canSubmit}>
        {isLoading ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
