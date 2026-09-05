"use client";

import { useRouter } from "next/navigation";

import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { BackfillingStage } from "@/app/(auth)/onboarding/connect/_components/backfilling-stage";
import { ConfirmLocationStage } from "@/app/(auth)/onboarding/connect/_components/confirm-location-stage";
import { ConnectStage } from "@/app/(auth)/onboarding/connect/_components/connect-stage";
import { DoneStage } from "@/app/(auth)/onboarding/connect/_components/done-stage";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useGoogleConnection } from "@/hooks/connection/use-google-connection";
import { useOnboardingConnectFlow } from "@/hooks/onboarding/use-onboarding-connect-flow";

export function OnboardingConnectView() {
  const router = useRouter();
  const { connect } = useGoogleConnection();
  const { stage, progress, importedCount, totalToImport, location, startConnect, confirmLocation } =
    useOnboardingConnectFlow();

  const handleGoToDashboard = async () => {
    await connect();
    router.push(ROUTES.DASHBOARD);
  };

  return (
    <>
      <AuthLogo />

      <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page w-full max-w-[480px] rounded-xl border border-border bg-card shadow-elevated duration-500 ease-fluid">
        {stage === "connect" ? <ConnectStage onConnect={startConnect} /> : null}
        {stage === "confirm_location" ? (
          <ConfirmLocationStage location={location} onContinue={confirmLocation} />
        ) : null}
        {stage === "backfilling" ? (
          <BackfillingStage progress={progress} importedCount={importedCount} totalToImport={totalToImport} />
        ) : null}
        {stage === "done" ? (
          <DoneStage totalImported={totalToImport} onGoToDashboard={handleGoToDashboard} />
        ) : null}
      </div>
    </>
  );
}
