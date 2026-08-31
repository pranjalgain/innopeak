import Image from "next/image";
import Link from "next/link";

import { LuArrowUpRight, LuCodeXml, LuHeart } from "react-icons/lu";

import { EXTERNAL_LINKS } from "@/app/_libs/constants/routes";

const footerLinks = [
  { label: "API reference", href: "/reference" },
  { label: "Users demo", href: "/users" },
  { label: "Observability demo", href: "/sentry-example-page" },
] as const;

/**
 * Shared footer with direct access to the boilerplate demos.
 */
export function SiteFooter() {
  return (
    <footer className="border-border/70 border-t px-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-10 py-12 md:grid-cols-[1fr_auto]">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/brand-mark.svg"
              alt="Create Next CoE"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold">Create Next CoE</span>
          </div>
          <p className="text-muted-foreground mt-4 max-w-md text-sm leading-6">
            A production-ready Next.js foundation for teams that would rather build product than
            rebuild infrastructure.
          </p>
        </div>

        <nav className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm" aria-label="Footer">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ))}
          <Link
            href={EXTERNAL_LINKS.REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
            Source
            <LuArrowUpRight aria-hidden="true" />
          </Link>
        </nav>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs md:col-span-2">
          <span className="inline-flex items-center gap-1.5">
            <LuCodeXml aria-hidden="true" />
            Next.js 16 · React 19 · TypeScript
          </span>
          <span className="inline-flex items-center gap-1.5">
            Built for teams who care
            <LuHeart className="text-primary" aria-hidden="true" />
          </span>
        </div>
      </div>
    </footer>
  );
}
