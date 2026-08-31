import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";


import type { IconType } from "react-icons";
import {
  LuActivity,
  LuArrowRight,
  LuBlocks,
  LuBookOpen,
  LuBraces,
  LuChartNoAxesCombined,
  LuCheck,
  LuCircleCheck,
  LuCloud,
  LuCodeXml,
  LuDatabase,
  LuFlag,
  LuFlaskConical,
  LuGauge,
  LuGitBranch,
  LuLayers3,
  LuLockKeyhole,
  LuRocket,
  LuServerCog,
  LuShieldCheck,
  LuSparkles,
  LuTerminal,
  LuWorkflow,
} from "react-icons/lu";

import { EXTERNAL_LINKS } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";


const FeatureFlagHero = dynamic(() => import("@/app/(public)/home/_components/feature-flag-hero"));

interface Capability {
  title: string;
  description: string;
  icon: IconType;
  label: string;
  highlights: readonly string[];
  className?: string;
}

interface FeatureGroup {
  title: string;
  description: string;
  icon: IconType;
  items: readonly string[];
}

const capabilities: readonly Capability[] = [
  {
    title: "A modern core that stays out of your way",
    description:
      "Next.js 16, React 19, strict TypeScript, Tailwind CSS 4, typed routes, and server-first architecture—already tuned to work together.",
    icon: LuLayers3,
    label: "Foundation",
    highlights: ["App Router", "Turbopack", "React Server Components", "46 UI primitives"],
    className: "lg:col-span-2",
  },
  {
    title: "Analytics that respect privacy",
    description:
      "Understand adoption, friction, and performance with PostHog, Vercel Analytics, Speed Insights, and a proxied GTM setup.",
    icon: LuChartNoAxesCombined,
    label: "Product intelligence",
    highlights: ["Heatmaps", "Dead clicks", "Web vitals", "Session signals"],
  },
  {
    title: "Production-grade error tracking",
    description:
      "Sentry-ready client, server, and edge coverage includes source maps, replay, tunneled events, and unified PostHog exceptions.",
    icon: LuActivity,
    label: "Observability",
    highlights: ["Tracing", "Replay", "Source maps", "Edge coverage"],
  },
  {
    title: "One data layer, three database engines",
    description:
      "Drizzle ORM is wired for SQLite, PostgreSQL, and MySQL, with schema examples, migrations, Studio commands, and Docker services.",
    icon: LuDatabase,
    label: "Data",
    highlights: ["SQLite", "PostgreSQL", "MySQL", "Drizzle Studio"],
  },
  {
    title: "Quality gates from commit to deploy",
    description:
      "Unit, integration, browser, lint, type, circular dependency, and build checks are scripted locally, with GitHub and GitLab CI templates included.",
    icon: LuShieldCheck,
    label: "Quality",
    highlights: ["Vitest", "Playwright", "Husky", "CI/CD"],
  },
  {
    title: "Contracts your API and UI can share",
    description:
      "Zod-validated handlers feed generated OpenAPI contracts and a polished Scalar reference, so documentation stays close to code.",
    icon: LuCodeXml,
    label: "API platform",
    highlights: ["Zod validation", "OpenAPI generation", "Scalar UI", "Health endpoint"],
    className: "lg:col-span-3",
  },
] as const;

const featureGroups: readonly FeatureGroup[] = [
  {
    title: "Framework & UI",
    description: "A fast, accessible base for product work.",
    icon: LuBlocks,
    items: [
      "Next.js 16 App Router",
      "React 19 server components",
      "Tailwind CSS 4 design tokens",
      "Radix-powered UI primitives",
      "Responsive layouts",
      "Light and dark themes",
    ],
  },
  {
    title: "Data & contracts",
    description: "Typed boundaries from storage to HTTP.",
    icon: LuBraces,
    items: [
      "Drizzle ORM and migrations",
      "SQLite, PostgreSQL, and MySQL",
      "Zod request validation",
      "Generated OpenAPI schema",
      "Interactive Scalar reference",
      "Type-safe environment variables",
    ],
  },
  {
    title: "Insight & reliability",
    description: "Know what users feel and systems do.",
    icon: LuGauge,
    items: [
      "PostHog product analytics",
      "Feature flags & experiments",
      "Sentry error monitoring",
      "Vercel Analytics",
      "Speed Insights",
      "GTM and ingest proxies",
    ],
  },
  {
    title: "Quality & delivery",
    description: "Confidence built into every handoff.",
    icon: LuGitBranch,
    items: [
      "Vitest unit and integration tests",
      "Playwright end-to-end coverage",
      "ESLint and Prettier",
      "Madge circular dependency checks",
      "Husky pre-commit gates",
      "GitHub and GitLab CI templates",
    ],
  },
] as const;

const workflowSteps = [
  {
    command: "pnpm setup",
    title: "Configure",
    description: "Create a validated local environment with sensible SQLite defaults.",
  },
  {
    command: "pnpm dev",
    title: "Develop",
    description: "Generate the OpenAPI contract, then start Next.js with Turbopack.",
  },
  {
    command: "pnpm test:run",
    title: "Verify",
    description: "Run unit and integration suites with the same setup used in CI.",
  },
  {
    command: "pnpm build",
    title: "Ship",
    description: "Produce an optimized build with observability and analytics hooks ready.",
  },
] as const;

const stack = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Tailwind CSS 4",
  "Drizzle ORM",
  "Vitest",
  "Playwright",
] as const;

const liveDemos = [
  {
    title: "Interactive API reference",
    description: "Explore generated OpenAPI operations in Scalar.",
    href: "/reference",
    icon: LuBookOpen,
  },
  {
    title: "Integration testing demo",
    description: "See deterministic user data built for API tests.",
    href: "/users",
    icon: LuFlaskConical,
  },
  {
    title: "Sentry observability test",
    description: "Validate connected client and server error capture.",
    href: "/sentry-example-page",
    icon: LuActivity,
  },
] as const;

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate border-b">
        <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-80" />
        <div className="bg-primary/15 pointer-events-none absolute -top-40 left-1/2 -z-10 size-[34rem] -translate-x-1/2 rounded-full blur-3xl" />
        <div className="bg-chart-2/10 pointer-events-none absolute top-40 -right-48 -z-10 size-96 rounded-full blur-3xl" />

        <div className="px-4 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl gap-14 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-32">
            <div>
              <Badge
                variant="outline"
                className="bg-background/70 border-primary/25 text-foreground mb-6 gap-2 px-3 py-1 backdrop-blur">
                <span className="bg-primary size-1.5 rounded-full shadow-[0_0_12px_var(--color-primary)]" />
                Production-ready · Open source · No lock-in
              </Badge>

              <h1 className="max-w-3xl text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
                Build faster. <span className="text-gradient">Own your stack.</span>
              </h1>
              <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8 text-balance sm:text-xl">
                Use this starter as-is, or as a reference for your own setup. The production
                plumbing is ready, so your team can move from idea to reliable product without weeks
                of glue work.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild size="lg" className="group">
                  <Link href={EXTERNAL_LINKS.REPOSITORY} target="_blank" rel="noopener noreferrer">
                    <LuGitBranch aria-hidden="true" />
                    Get started
                    <LuArrowRight
                      className="transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#features">See features</Link>
                </Button>
                <Button asChild variant="ghost" size="lg">
                  <Link href="#demo">See live demo</Link>
                </Button>
              </div>

              <div className="text-muted-foreground mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-xs">
                {["Node 24 ready", "Strict TypeScript", "Accessible primitives"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-1.5">
                    <LuCircleCheck className="text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:justify-self-end">
              <div className="border-primary/20 bg-card/90 absolute -inset-3 -z-10 rounded-[2rem] border blur-sm" />
              <Card className="bg-card/90 overflow-hidden py-0 shadow-2xl backdrop-blur-xl">
                <div className="border-border/70 flex items-center justify-between border-b px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-destructive/70 size-2.5 rounded-full" />
                    <span className="bg-chart-4/80 size-2.5 rounded-full" />
                    <span className="bg-chart-2/80 size-2.5 rounded-full" />
                  </div>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    release-readiness.ts
                  </span>
                  <Badge variant="secondary" className="gap-1.5">
                    <span className="bg-chart-2 size-1.5 rounded-full" />
                    ready
                  </Badge>
                </div>

                <CardContent className="p-5 sm:p-6">
                  <div className="bg-background/70 rounded-xl border p-4 font-mono text-xs">
                    <div className="text-muted-foreground mb-3 flex items-center gap-2">
                      <LuTerminal aria-hidden="true" />
                      ~/your-next-product
                    </div>
                    <p>
                      <span className="text-primary">$</span> pnpm dev
                    </p>
                    <div className="text-muted-foreground mt-3 space-y-1.5">
                      <p className="text-chart-2">✓ OpenAPI contract generated</p>
                      <p className="text-chart-2">✓ Environment schema validated</p>
                      <p className="text-chart-2">✓ Turbopack ready in 412ms</p>
                      <p>
                        ▲ Next.js 16.2.12{" "}
                        <span className="text-foreground">http://localhost:3000</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {[
                      { label: "Type safety", value: "strict", icon: LuLockKeyhole },
                      { label: "Test layers", value: "3 ready", icon: LuFlaskConical },
                      { label: "DB engines", value: "3 wired", icon: LuDatabase },
                      { label: "UI primitives", value: "46", icon: LuBlocks },
                    ].map((metric) => (
                      <div key={metric.label} className="bg-muted/45 rounded-xl border p-3">
                        <metric.icon className="text-primary mb-3 size-4" aria-hidden="true" />
                        <p className="text-sm font-medium">{metric.value}</p>
                        <p className="text-muted-foreground mt-0.5 text-[11px]">{metric.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-border/70 mt-5 flex items-center justify-between border-t pt-5">
                    <div className="flex -space-x-2">
                      {[LuActivity, LuFlag, LuCloud, LuShieldCheck].map((Icon, index) => (
                        <span
                          key={index}
                          className="bg-background border-card flex size-8 items-center justify-center rounded-full border-2">
                          <Icon className="text-muted-foreground size-3.5" aria-hidden="true" />
                        </span>
                      ))}
                    </div>
                    <p className="text-muted-foreground text-right text-xs">
                      Observability hooks ready
                      <span className="text-foreground block font-medium">before first deploy</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="border-border/70 bg-background/60 border-t px-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-4 py-5">
            <span className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              Built on
            </span>
            {stack.map((technology) => (
              <span key={technology} className="text-sm font-medium">
                {technology}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-5">
              <LuSparkles aria-hidden="true" />
              Batteries included
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              Everything you need to launch
            </h2>
            <p className="text-muted-foreground mt-5 text-lg leading-8 text-balance">
              Curated defaults across product analytics, reliability, data, testing, and delivery.
              Every integration is removable, so the architecture stays yours.
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => (
              <Card
                key={capability.title}
                className={cn(
                  "group hover:border-primary/35 relative overflow-hidden shadow-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
                  capability.className,
                )}>
                <div className="bg-primary/10 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />
                <CardHeader className="relative gap-5">
                  <div className="flex items-center justify-between">
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                      <capability.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
                      {capability.label}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl leading-tight font-semibold tracking-tight">
                      {capability.title}
                    </h3>
                    <p className="text-muted-foreground mt-3 text-sm leading-6">
                      {capability.description}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="relative mt-auto">
                  <div className="flex flex-wrap gap-2">
                    {capability.highlights.map((highlight) => (
                      <Badge key={highlight} variant="secondary" className="font-normal">
                        {highlight}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="bg-card/45 scroll-mt-24 border-y px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <Badge variant="outline" className="mb-5">
              <LuWorkflow aria-hidden="true" />
              Developer workflow
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              From clone to confidence in four commands.
            </h2>
            <p className="text-muted-foreground mt-5 leading-7">
              The local workflow mirrors CI. Every command is documented, composable, and backed by
              examples already living in the repository.
            </p>
            <Button asChild variant="outline" className="mt-7">
              <Link href="/reference">
                <LuBookOpen aria-hidden="true" />
                Browse the API reference
              </Link>
            </Button>
          </div>

          <ol className="relative space-y-4">
            <div
              className="bg-border absolute top-8 bottom-8 left-[1.45rem] w-px"
              aria-hidden="true"
            />
            {workflowSteps.map((step, index) => (
              <li
                key={step.command}
                className="bg-background relative grid gap-4 rounded-2xl border p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <span className="bg-primary text-primary-foreground z-10 flex size-8 items-center justify-center rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-6">{step.description}</p>
                </div>
                <code className="bg-muted text-foreground w-fit rounded-lg px-3 py-2 font-mono text-xs">
                  {step.command}
                </code>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="demo" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-primary/25 bg-primary/[0.035] relative overflow-hidden shadow-none">
              <div className="bg-primary/10 pointer-events-none absolute -top-24 -right-24 size-72 rounded-full blur-3xl" />
              <CardHeader className="relative">
                <Badge variant="outline" className="mb-3">
                  <LuFlag aria-hidden="true" />
                  Live integration
                </Badge>
                <h2 className="text-3xl font-semibold tracking-tight">Live feature flag demo</h2>
                <p className="text-muted-foreground max-w-xl leading-7">
                  This section swaps content based on a PostHog feature flag variant.
                </p>
              </CardHeader>
              <CardContent className="relative">
                <Suspense fallback={<Skeleton className="h-44 w-full rounded-2xl" />}>
                  <FeatureFlagHero />
                </Suspense>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {liveDemos.map((demo) => (
                <Link
                  key={demo.href}
                  href={demo.href}
                  className="bg-card hover:border-primary/35 group flex items-center gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                    <demo.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{demo.title}</span>
                    <span className="text-muted-foreground mt-1 block text-sm">
                      {demo.description}
                    </span>
                  </span>
                  <LuArrowRight
                    className="text-muted-foreground size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-card/45 border-y px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <Badge variant="outline" className="mb-5">
              <LuServerCog aria-hidden="true" />
              Under the hood
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              A complete baseline, not a blank canvas.
            </h2>
            <p className="text-muted-foreground mt-4 leading-7">
              Keep what your product needs. Remove what it does not. The important part is that each
              concern already has a production-minded implementation to start from.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {featureGroups.map((group) => (
              <div key={group.title} className="bg-background rounded-2xl border p-5">
                <group.icon className="text-primary size-5" aria-hidden="true" />
                <h3 className="mt-5 font-semibold">{group.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-6">{group.description}</p>
                <ul className="mt-5 space-y-3">
                  {group.items.map((item) => (
                    <li key={item} className="text-muted-foreground flex items-start gap-2 text-sm">
                      <LuCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="bg-foreground text-background relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-16 lg:px-16">
          <div className="bg-primary/30 pointer-events-none absolute -top-32 -right-20 size-96 rounded-full blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <span className="font-mono text-xs tracking-[0.2em] uppercase opacity-60">
                Your next product starts here
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
                Skip the setup sprint. Start with the product.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 opacity-70">
                Clone a foundation that already speaks production: contracts, telemetry, tests,
                data, performance, and accessible UI included.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button asChild size="lg" variant="secondary">
                <Link href={EXTERNAL_LINKS.REPOSITORY} target="_blank" rel="noopener noreferrer">
                  <LuRocket aria-hidden="true" />
                  Start building
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-background/20 hover:bg-background/10 bg-transparent text-current hover:text-current">
                <Link href="/showcase">Open full showcase</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
