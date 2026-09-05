interface InnoPeakDiamondMarkProps {
  className?: string;
}

/**
 * Just the diamond/peak mark cropped out of the full lockup
 * (`InnoPeakLogo`), for spots without room for the wordmark — the
 * dashboard sidebar's collapsed icon-only rail, and the favicon.
 */
export function InnoPeakDiamondMark({ className }: InnoPeakDiamondMarkProps) {
  return (
    <svg viewBox="190.91 38.72 43.33 74.31" className={className} role="img" aria-label="InnoPeak">
      <path
        fill="#db2568"
        d="M222.41,74.78h-19.67l-9.83-17.03,9.83-17.03h19.67l9.83,17.03-9.83,17.03ZM203.9,72.78h17.36l8.68-15.03-8.68-15.03h-17.36l-8.68,15.03,8.68,15.03Z"
      />
      <polygon
        fill="#db2568"
        points="221.8 78.96 203.29 78.96 194.04 94.99 203.29 111.03 221.81 111.03 231.06 94.99 221.8 78.96"
      />
    </svg>
  );
}
