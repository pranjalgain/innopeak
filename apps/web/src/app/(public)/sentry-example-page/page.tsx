"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";


import {
  LuActivity,
  LuArrowLeft,
  LuArrowUpRight,
  LuBug,
  LuCheck,
  LuCircleDot,
  LuRadio,
  LuTriangleAlert,
} from "react-icons/lu";

import { EXTERNAL_LINKS } from "@/app/_libs/constants/routes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


type ConnectionStatus = "checking" | "connected" | "blocked";

class SentryExampleFrontendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleFrontendError";
  }
}

/**
 * Interactive diagnostics for the configured Sentry client and API instrumentation.
 */
export default function SentryExamplePage() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("checking");
  const [hasSentServerError, setHasSentServerError] = useState(false);

  useEffect(() => {
    async function checkConnectivity() {
      const result = await Sentry.diagnoseSdkConnectivity();
      setConnectionStatus(result === "sentry-unreachable" ? "blocked" : "connected");
    }

    void checkConnectivity();
  }, []);

  async function sendSampleError() {
    await Sentry.startSpan(
      {
        name: "Example Frontend/Backend Span",
        op: "test",
      },
      async () => {
        const response = await fetch("/api/sentry-example-api");
        if (!response.ok) {
          setHasSentServerError(true);
        }
      },
    );

    throw new SentryExampleFrontendError(
      "This error is raised on the frontend of the example page.",
    );
  }

  const isConnected = connectionStatus === "connected";

  return (
    <main className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="surface-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 opacity-60" />
      <div className="bg-primary/10 pointer-events-none absolute top-20 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full blur-3xl" />

      <div className="mx-auto w-full max-w-7xl">
        <Button asChild variant="ghost" size="sm" className="mb-8 -ml-3">
          <Link href="/">
            <LuArrowLeft aria-hidden="true" />
            Back to Home
          </Link>
        </Button>

        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="mb-5">
            <LuActivity aria-hidden="true" />
            Observability test bench
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Verify errors before users find them.
          </h1>
          <p className="text-muted-foreground mt-5 text-lg leading-8 text-balance">
            Trigger one trace spanning the browser and API route, then inspect the connected Sentry
            project to confirm source maps, context, and exception capture.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <Card className="shadow-xl">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <LuBug className="text-primary" aria-hidden="true" />
                    Send a sample exception
                  </CardTitle>
                  <CardDescription className="mt-2">
                    This intentionally creates both API and browser errors.
                  </CardDescription>
                </div>
                <ConnectionBadge status={connectionStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-muted/40 rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
                    <LuRadio aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Frontend → API → Sentry</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      One distributed diagnostic span
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                  {["Browser", "API route", "Issues"].map((label, index) => (
                    <div key={label} className="contents">
                      <span className="bg-background rounded-lg border px-2 py-2 text-center text-xs">
                        {label}
                      </span>
                      {index < 2 && (
                        <span className="text-muted-foreground" aria-hidden="true">
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {connectionStatus === "blocked" && (
                <Alert variant="destructive">
                  <LuTriangleAlert aria-hidden="true" />
                  <AlertTitle>Sentry is unreachable</AlertTitle>
                  <AlertDescription>
                    Network requests may be blocked by an extension. Disable the blocker, then
                    refresh this page to run the test.
                  </AlertDescription>
                </Alert>
              )}

              {hasSentServerError && (
                <Alert>
                  <LuCheck aria-hidden="true" />
                  <AlertTitle>Server exception sent</AlertTitle>
                  <AlertDescription>
                    The API event was dispatched. The browser exception will follow.
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={!isConnected}
                onClick={() => void sendSampleError()}>
                <LuBug aria-hidden="true" />
                {connectionStatus === "checking" ? "Checking connection…" : "Throw sample error"}
              </Button>

              <p className="text-muted-foreground text-center text-xs leading-5">
                This action is expected to open the global error boundary.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-foreground text-background shadow-none">
            <CardHeader>
              <span className="bg-background/10 flex size-10 items-center justify-center rounded-xl">
                <LuCircleDot className="size-5" aria-hidden="true" />
              </span>
              <CardTitle className="mt-4 text-lg">What is already wired</CardTitle>
              <CardDescription className="text-background/60">
                The boilerplate ships with the critical Sentry integration points configured.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {[
                  "Client, server, and edge capture",
                  "Session replay and browser tracing",
                  "Production source map uploads",
                  "Tunneled monitoring requests",
                  "PostHog exception correlation",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button asChild variant="secondary" className="mt-6 w-full">
                <Link
                  href={EXTERNAL_LINKS.SENTRY_NEXTJS_DOCS}
                  target="_blank"
                  rel="noopener noreferrer">
                  Sentry setup guide
                  <LuArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const labels: Record<ConnectionStatus, string> = {
    checking: "Checking",
    connected: "Connected",
    blocked: "Blocked",
  };

  return (
    <Badge variant={status === "blocked" ? "destructive" : "secondary"} className="gap-1.5">
      <span
        className={
          status === "connected"
            ? "bg-chart-2 size-1.5 rounded-full"
            : "bg-muted-foreground size-1.5 rounded-full"
        }
      />
      {labels[status]}
    </Badge>
  );
}
