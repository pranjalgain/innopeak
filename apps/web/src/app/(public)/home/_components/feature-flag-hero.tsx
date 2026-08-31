"use client";

import { useFeatureFlagVariantKey } from "@posthog/react";
import { LuBadgeCheck, LuClapperboard, LuImage, LuSparkles } from "react-icons/lu";

import { Badge } from "@/components/ui/badge";
import { env } from "env";

export default function FeatureFlagHero() {
  const feature = useFeatureFlagVariantKey("new-landing-page");
  const isConfigured = Boolean(env.NEXT_PUBLIC_POSTHOG_KEY);
  const isVideoVariant = feature === "show-video-hero";

  return (
    <div className="bg-background/80 relative overflow-hidden rounded-2xl border p-5 sm:p-6">
      <div className="bg-primary/10 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="bg-primary/10 text-primary flex size-14 shrink-0 items-center justify-center rounded-2xl">
          {isVideoVariant ? (
            <LuClapperboard className="size-6" aria-hidden="true" />
          ) : (
            <LuImage className="size-6" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <LuSparkles aria-hidden="true" />
              Variant: {isConfigured ? (isVideoVariant ? "video" : "image") : "fallback"}
            </Badge>
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
              <LuBadgeCheck className="text-chart-2" aria-hidden="true" />
              {isConfigured ? "Evaluated live" : "Ready to configure"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">
            {isConfigured
              ? isVideoVariant
                ? "Video-first hero enabled"
                : "Image-first hero enabled"
              : "Feature flag integration ready"}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {isConfigured ? (
              <>
                PostHog selected this experience using the{" "}
                <code className="text-foreground font-mono">new-landing-page</code> feature flag.
              </>
            ) : (
              <>
                Add your PostHog key and create the{" "}
                <code className="text-foreground font-mono">new-landing-page</code> flag to activate
                live variants.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
