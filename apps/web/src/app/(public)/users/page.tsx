import Link from "next/link";

import { LuArrowLeft, LuBraces, LuCircleCheck, LuFlaskConical, LuUsers } from "react-icons/lu";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const users = [
  { id: "1", name: "John Doe", email: "john@example.com", initials: "JD" },
  { id: "2", name: "Jane Smith", email: "jane@example.com", initials: "JS" },
] as const;

/**
 * Demonstrates stable data and semantic queries used by integration tests.
 */
export default function UsersPage() {
  return (
    <main className="relative overflow-hidden px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="surface-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 opacity-60" />
      <div className="mx-auto w-full max-w-7xl">
        <Button asChild variant="ghost" size="sm" className="mb-8 -ml-3">
          <Link href="/">
            <LuArrowLeft aria-hidden="true" />
            Back to Home
          </Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
          <div>
            <Badge variant="outline" className="mb-5">
              <LuFlaskConical aria-hidden="true" />
              Integration fixture
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Simple Users Demo
            </h1>
            <p className="text-muted-foreground mt-5 max-w-2xl text-lg leading-8">
              Displaying hardcoded users. This demonstrates simple integration testing patterns with
              deterministic data, semantic selectors, and a matching API response.
            </p>
          </div>

          <div className="bg-card rounded-2xl border p-5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">Fixture status</span>
              <Badge variant="secondary" className="gap-1.5">
                <span className="bg-chart-2 size-1.5 rounded-full" />
                Ready
              </Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-2xl font-semibold">{users.length}</p>
                <p className="text-muted-foreground mt-1 text-xs">stable records</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3">
                <p className="text-2xl font-semibold">200</p>
                <p className="text-muted-foreground mt-1 text-xs">expected status</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_0.72fr]">
          <Card className="shadow-none">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <LuUsers className="text-primary" aria-hidden="true" />
                    Users List
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Data matches our <code className="font-mono">/api/simple-users</code> endpoint.
                  </CardDescription>
                </div>
                <Badge variant="outline">{users.length} users</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-muted/35 hover:border-primary/30 flex items-center gap-4 rounded-xl border p-4 transition-colors"
                  data-testid={`user-${user.id}`}>
                  <Avatar className="size-11">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {user.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold">{user.name}</h2>
                    <p className="text-muted-foreground truncate text-sm">{user.email}</p>
                  </div>
                  <Badge variant="secondary" className="font-mono">
                    #{user.id}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-foreground text-background shadow-none">
            <CardHeader>
              <span className="bg-background/10 flex size-10 items-center justify-center rounded-xl">
                <LuBraces className="size-5" aria-hidden="true" />
              </span>
              <CardTitle className="mt-4 text-lg">Built to be testable</CardTitle>
              <CardDescription className="text-background/60">
                The example keeps UI data aligned with the API contract so tests can cover both
                layers without fragile fixtures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm">
                {[
                  "Stable test IDs for each record",
                  "Accessible labels and headings",
                  "Matching integration API data",
                  "Cross-browser Playwright coverage",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <LuCircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button asChild variant="secondary" className="mt-6 w-full">
                <Link href="/api/simple-users">View JSON response</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
