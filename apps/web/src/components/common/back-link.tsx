import type { Route } from "next";
import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

interface BackLinkProps {
  href: string;
  label: string;
  className?: string;
}

export function BackLink({ href, label, className }: BackLinkProps) {
  return (
    <Link
      href={href as Route}
      className={cn(
        "-ml-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors ease-fluid hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <LuArrowLeft className="size-3.5" />
      {label}
    </Link>
  );
}
