import type { Metadata } from "next";

import HomePage from "@/app/(public)/home/page";

export const metadata: Metadata = {
  title: "Boilerplate Showcase",
  description:
    "Explore the framework, data, observability, testing, analytics, and delivery features included with Create Next CoE.",
};

/**
 * Exposes the complete boilerplate showcase at the documented route.
 */
export default function ShowcasePage() {
  return <HomePage />;
}
