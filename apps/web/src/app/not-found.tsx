import Link from "next/link";

import { LuArrowLeft, LuCompass } from "react-icons/lu";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-16">
      <div className="surface-grid pointer-events-none absolute inset-0 -z-20 opacity-70" />
      <div className="bg-primary/10 pointer-events-none absolute top-1/2 left-1/2 -z-10 size-96 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
      <div className="w-full max-w-xl text-center">
        <div className="bg-card mx-auto flex size-20 items-center justify-center rounded-[1.5rem] border shadow-xl">
          <LuCompass className="text-primary size-8" aria-hidden="true" />
        </div>
        <p className="text-muted-foreground mt-7 font-mono text-xs tracking-[0.2em] uppercase">
          Route unavailable
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Page not found</h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-md text-lg leading-8">
          This route does not exist, or it may have moved while the product evolved.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">
            <LuArrowLeft aria-hidden="true" />
            Back to the homepage
          </Link>
        </Button>
      </div>
    </main>
  );
}
