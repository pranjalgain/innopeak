import { DecorativeBackground } from "@/app/(auth)/_components/decorative-background";
import { LanguageSwitcher } from "@/app/_components/language-switcher";

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * Full-viewport centered shell for auth screens (login, onboarding) — a
 * faint decorative background behind whatever card the page renders.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center gap-6 bg-background px-4 py-8 sm:gap-7 sm:px-8 sm:py-12">
      <DecorativeBackground />
      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <LanguageSwitcher />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center gap-6 sm:gap-7">
        {children}
      </div>
    </div>
  );
}
