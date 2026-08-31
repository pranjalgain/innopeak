import Image from "next/image";
import Link from "next/link";

import { LuArrowUpRight } from "react-icons/lu";


import { ThemeToggle } from "@/app/_components/theme-toggle";
import { EXTERNAL_LINKS } from "@/app/_libs/constants/routes";
import { Button } from "@/components/ui/button";

const navigationItems = [
  { label: "Features", href: "/#features" },
  { label: "Workflow", href: "/#workflow" },
  { label: "Live demos", href: "/#demo" },
  { label: "API reference", href: "/reference" },
] as const;

/**
 * Shared product navigation for public routes.
 */
export function SiteHeader() {
  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-50 border-b px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between">
        <Link
          href="/"
          className="focus-visible:ring-ring flex items-center gap-3 rounded-md outline-none focus-visible:ring-2">
          <Image
            src="/brand-mark.svg"
            alt="Project logo"
            width={34}
            height={34}
            priority
            className="rounded-[0.6rem]"
          />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">
            Create Next CoE
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <Button key={item.href} asChild variant="ghost" size="sm">
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href={EXTERNAL_LINKS.REPOSITORY} target="_blank" rel="noopener noreferrer">
              View repository
              <LuArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
