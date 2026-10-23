"use client";

import { useTranslations } from "next-intl";
import { LuUserRound } from "react-icons/lu";

import { AddPasswordForm } from "@/app/(dashboard)/settings/_components/add-password-form";
import { ChangePasswordForm } from "@/app/(dashboard)/settings/_components/change-password-form";
import { getInitials } from "@/app/_libs/utils/initials";
import { AvatarUpload } from "@/components/common/avatar-upload";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

/** Always reachable: the platform's password switch only closes new email/password sign-ups, so managing a password stays available. */
export function ProfileSettingsSection() {
  const t = useTranslations("settings.profile");
  const {
    profile,
    isLoading,
    isError,
    refetch,
    updateAvatar,
    isUploadingAvatar,
    changePassword,
    requestSetPasswordOtp,
    setPassword,
  } = useTenantOwnerProfile();

  if (isError && !profile) return <LoadErrorState onRetry={refetch} />;
  if (isLoading || !profile) return <Skeleton className="h-56 w-full max-w-3xl rounded-xl" />;

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuUserRound className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AvatarUpload
          avatarUrl={profile.avatarUrl}
          initials={getInitials(profile.name)}
          changeLabel={t("changePicture")}
          isUploading={isUploadingAvatar}
          onUpload={updateAvatar}
        />

        <div className="border-border flex flex-col gap-1.5 border-t pt-5">
          <Label>{t("nameLabel")}</Label>
          <p className="text-sm">{profile.name}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("emailLabel")}</Label>
          <p className="text-sm">{profile.email}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{t("businessNameLabel")}</Label>
          <p className="text-sm">{profile.businessName}</p>
        </div>

        {profile.hasPassword ? (
          <ChangePasswordForm changePassword={changePassword} />
        ) : (
          <AddPasswordForm requestSetPasswordOtp={requestSetPasswordOtp} setPassword={setPassword} />
        )}
      </CardContent>
    </Card>
  );
}
