import type { Route } from "next";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LuArrowRight,
  LuChartNoAxesCombined,
  LuCheck,
  LuList,
  LuLockKeyhole,
  LuSlidersHorizontal,
  LuSparkles,
  LuTriangleAlert,
  LuZap,
} from "react-icons/lu";

import { ReviewReplyMockup } from "@/app/(public)/_components/review-reply-mockup";
import { RedirectIfAuthenticated } from "@/app/_components/redirect-if-authenticated";
import { ROUTES } from "@/app/_libs/constants/routes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface CopyItem {
  title: string;
  description: string;
}

const FEATURE_ICONS = [
  LuList,
  LuSparkles,
  LuSlidersHorizontal,
  LuTriangleAlert,
  LuChartNoAxesCombined,
  LuLockKeyhole,
  LuZap,
];

export default function LandingPage() {
  const t = useTranslations("marketing");

  const trustItems = t.raw("trustBar.items") as string[];
  const problemItems = t.raw("problem.items") as CopyItem[];
  const steps = t.raw("howItWorks.steps") as CopyItem[];
  const features = t.raw("features.items") as CopyItem[];

  return (
    <RedirectIfAuthenticated>
    <main className="overflow-hidden">
      {/* Hero */}
      <section className="relative isolate border-b border-border">
        <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-70" />
        <div className="bg-primary/15 pointer-events-none absolute -top-40 left-1/2 -z-10 size-[34rem] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-warning/10 pointer-events-none absolute top-40 -right-48 -z-10 size-96 rounded-full blur-3xl" />

        <div className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl gap-14 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-32">
            <div>
              <Badge
                variant="outline"
                className="mb-6 gap-2 border-primary/25 bg-background/70 px-3 py-1 text-foreground backdrop-blur"
              >
                <span className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
                {t("hero.eyebrow")}
              </Badge>

              <h1 className="max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[3.4rem]">
                <span className="text-gradient">{t("hero.headline")}</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground text-balance sm:text-xl">
                {t("hero.subheadline")}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="group">
                  <Link href={ROUTES.ONBOARDING_SIGNUP as Route}>
                    {t("hero.primaryCta")}
                    <LuArrowRight
                      className="transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#how-it-works">{t("hero.secondaryCta")}</Link>
                </Button>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs text-muted-foreground">
                {trustItems.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <LuCheck className="text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg lg:mx-0 lg:justify-self-end">
              <div className="absolute -inset-3 -z-10 rounded-[2rem] border border-primary/20 bg-card/90 blur-sm" />
              <ReviewReplyMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("problem.heading")}
            </h2>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {problemItems.map((item) => (
              <Card key={item.title} className="shadow-none">
                <CardContent className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 border-y border-border bg-card/45 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("howItWorks.heading")}
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">{t("howItWorks.description")}</p>
          </div>

          <ol className="relative mx-auto mt-14 max-w-3xl space-y-4">
            <div className="absolute top-8 bottom-8 left-[1.45rem] w-px bg-border" aria-hidden="true" />
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative grid gap-1 rounded-2xl border border-border bg-background p-5 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-4"
              >
                <span className="z-10 flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <Badge variant="outline" className="mb-5">
              <LuSparkles aria-hidden="true" />
              {t("nav.features")}
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t("features.heading")}
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">{t("features.description")}</p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? LuSparkles;
              return (
                <Card
                  key={feature.title}
                  className="group relative overflow-hidden shadow-none transition-all duration-300 ease-fluid hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-xl"
                >
                  <div className="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-primary/10 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                  <CardContent className="relative flex flex-col gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-lg font-semibold tracking-tight">{feature.title}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-foreground px-6 py-14 text-background sm:px-12 sm:py-16 lg:px-16">
          <div className="pointer-events-none absolute -top-32 -right-20 size-96 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {t("cta.heading")}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 opacity-70">{t("cta.description")}</p>
            </div>
            <Button asChild size="lg" variant="secondary" className="shrink-0">
              <Link href={ROUTES.ONBOARDING_SIGNUP as Route}>
                {t("cta.button")}
                <LuArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
    </RedirectIfAuthenticated>
  );
}
