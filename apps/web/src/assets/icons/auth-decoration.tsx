/**
 * Faint scattered stars, map pins, comment bubbles and small sparkle diamonds behind auth cards.
 * Originally matched `innopeak-design.html`'s Login/Onboarding artboards one-to-one; has since
 * diverged on request (denser, pins sized to match the other shapes, everything a touch fainter)
 * and no longer tracks that file. Purely decorative — non-interactive, meant to sit behind a card
 * via z-index. The pin is the Material "place" glyph (teardrop + ring), traced as an outline to
 * match the line-art weight of the other shapes rather than kept solid the way Material renders
 * it by default.
 */
export function AuthDecoration() {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 1366 670"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(852.8,321.9)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(654.6,579.7)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(928.9,492.6)"
        fill="var(--border)"
        opacity="0.49"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(111.9,50.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(1248.4,474.9)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(1107.1,269.4)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(846.6,170.9)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(349.2,245.2)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(30.4,87.9) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.63"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(590.2,438.6)"
        fill="var(--border)"
        opacity="0.51"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(139.8,215.0)"
        fill="var(--border)"
        opacity="0.47"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(737.9,46.4)"
        fill="var(--border)"
        opacity="0.42"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(174.2,105.1)"
        fill="var(--border)"
        opacity="0.35"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(117.0,36.7)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(977.4,184.6)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -7.0 L1.65 -2.27 L6.66 -2.16 L2.66 0.87 L4.11 5.66 L0.0 2.8 L-4.11 5.66 L-2.66 0.87 L-6.66 -2.16 L-1.65 -2.27 Z"
        transform="translate(1314.4,63.3)"
        fill="var(--border)"
        opacity="0.37"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(1010.8,339.7) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.6"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(300.3,531.5) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.53"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(1308.6,125.2) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.64"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(39.2,373.6)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(500.4,88.6)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(1181.7,378.3)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(61.5,481.2)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(701.9,601.4)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0.0 -15.0 L3.53 -4.85 L14.27 -4.64 L5.71 1.85 L8.82 12.14 L0.0 6.0 L-8.82 12.14 L-5.71 1.85 L-14.27 -4.64 L-3.53 -4.85 Z"
        transform="translate(1251.8,281.7)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(451.3,519.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(950.7,62.4)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(202.6,420.1)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(1204.9,548.6)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 6 a6 6 0 0 1 6 -6 h18 a6 6 0 0 1 6 6 v8 a6 6 0 0 1 -6 6 h-9 l-6 6 v-6 h-3 a6 6 0 0 1 -6 -6 Z"
        transform="translate(500.1,349.9)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.82"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(950.2,480.6) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.58"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(1102.4,548.9) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.56"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(251.9,79.7) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.61"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(902.3,602.1) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.57"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(400.1,459.7) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(1050.6,89.4) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.62"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(150.7,559.8) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.54"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(760.4,330.2) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.59"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(1300.2,420.5) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.65"
      />
      <path
        d="M0 -9C-3.87 -9 -7 -5.87 -7 -2c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM0 0.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        transform="translate(550.8,240.3) scale(1.8)"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        opacity="0.52"
      />
    </svg>
  );
}
