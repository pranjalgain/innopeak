import Link from "next/link";

import type { IconType } from "react-icons";
import { LuArrowLeft, LuHouse } from "react-icons/lu";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AccessStateProps {
  code: string;
  title: string;
  description: string;
  icon: IconType;
}

/**
 * Renders a consistent, accessible access-control state.
 */
export function AccessState({ code, title, description, icon: Icon }: AccessStateProps) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-70" />
      <div className="bg-destructive/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />

      <div className="w-full max-w-xl text-center">
        <div className="bg-card mx-auto flex size-20 items-center justify-center rounded-[1.5rem] border shadow-xl">
          <Icon className="text-destructive size-8" aria-hidden="true" />
        </div>
        <Badge variant="outline" className="mt-7 font-mono">
          HTTP {code}
        </Badge>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-lg leading-8">
          {description}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/">
              <LuHouse aria-hidden="true" />
              Return Home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/#features">
              <LuArrowLeft aria-hidden="true" />
              Explore the boilerplate
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
