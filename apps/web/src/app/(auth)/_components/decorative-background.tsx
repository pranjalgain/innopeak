import { AuthDecoration } from "@/assets/icons/auth-decoration";

export function DecorativeBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AuthDecoration />
    </div>
  );
}
