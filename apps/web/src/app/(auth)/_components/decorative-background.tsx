import { AuthDecoration } from "@/assets/icons/auth-decoration";

/**
 * Positions the decorative scatter SVG behind the auth cards, matching
 * `innopeak-design.html`'s Login/Onboarding artboards.
 */
export function DecorativeBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AuthDecoration />
    </div>
  );
}
