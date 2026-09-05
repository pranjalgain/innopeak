import * as React from "react";

const TOTAL_REVIEWS_TO_IMPORT = 187;

/** Mocked result of the Google Business Profile lookup — no real API call yet. */
const DISCOVERED_LOCATION = {
  name: "The Coastal Table",
  address: "214 Harbor St, Portland, ME",
};

export type OnboardingConnectStage = "connect" | "confirm_location" | "backfilling" | "done";

export interface DiscoveredLocation {
  name: string;
  address: string;
}

interface UseOnboardingConnectFlowResult {
  stage: OnboardingConnectStage;
  /** 0-100 */
  progress: number;
  importedCount: number;
  totalToImport: number;
  /** The business Google found for this account — populated once `stage` reaches `confirm_location`. */
  location: DiscoveredLocation;
  startConnect: () => void;
  confirmLocation: () => void;
}

/**
 * Drives the 4-step connect flow: connect → confirm the found business →
 * watch the (simulated) review-history backfill → done. The backfill
 * auto-advances on a timer, matching the design's own progress simulation —
 * there's no real import job to poll yet. `location` stands in for what a
 * real Google Business Profile lookup would return — this is what lets the
 * rest of the app (and the signup wizard) get the business name/address
 * without ever asking for it manually.
 */
export function useOnboardingConnectFlow(): UseOnboardingConnectFlowResult {
  const [stage, setStage] = React.useState<OnboardingConnectStage>("connect");
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (stage !== "backfilling") return;

    const interval = setInterval(() => {
      setProgress((current) => {
        const step = 6 + Math.floor(Math.random() * 6);
        const next = Math.min(100, current + step);
        if (next >= 100) {
          clearInterval(interval);
          setStage("done");
        }
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [stage]);

  const startConnect = React.useCallback(() => setStage("confirm_location"), []);

  const confirmLocation = React.useCallback(() => {
    setProgress(0);
    setStage("backfilling");
  }, []);

  return {
    stage,
    progress,
    importedCount: Math.min(TOTAL_REVIEWS_TO_IMPORT, Math.round((progress / 100) * TOTAL_REVIEWS_TO_IMPORT)),
    totalToImport: TOTAL_REVIEWS_TO_IMPORT,
    location: DISCOVERED_LOCATION,
    startConnect,
    confirmLocation,
  };
}
