interface MicrosoftLogoProps {
  size?: number;
  className?: string;
}

/**
 * Microsoft's four-square logo mark, used as-is on SSO entry points.
 */
export function MicrosoftLogo({ size = 17, className = "shrink-0" }: MicrosoftLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
