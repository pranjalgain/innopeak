import Link from "next/link";

import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import { LuHouse } from "react-icons/lu";

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
 *
 * `title`/`description` arrive already translated from each page, so this stays a presentational
 * component; only its own action label is looked up here.
 *
 * One action, deliberately. This used to offer a second "Explore the boilerplate" button pointing
 * at the marketing page's `#features` anchor — leftover template copy from before anything linked
 * here at all. These pages are now the real destination for a genuine access rejection (the route
 * guards and `proxy.ts` send wrong-principal traffic to `/forbidden`), and inviting someone who
 * just hit an authorization error to go browse feature marketing is not a serious answer. "Return
 * home" is: `/` is itself guarded, so it lands each principal on the home that's actually theirs.
 */
export function AccessState({ code, title, description, icon: Icon }: AccessStateProps) {
  const t = useTranslations("accessState");

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

        <div className="mt-8 flex justify-center">
          <Button asChild size="lg">
            <Link href="/">
              <LuHouse aria-hidden="true" />
              {t("returnHome")}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
