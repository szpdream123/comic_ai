import React from "react";

export function LoomicLogo({ className = "", ...props }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M50 4C56 4 64 8 68 16c6-6 16-6 22 2 6 8 6 18 0 24 8 6 10 16 6 24s-12 12-20 10c-4 8-14 16-26 16S28 84 24 76c-8 2-16-2-20-10S2 48 10 42c-6-6-6-16 0-24s16-8 22-2C36 8 44 4 50 4Z"
        fill="currentColor"
      />
      <path d="m31 46 4.5-12L40 46l11 4.5L40 55l-4.5 12L31 55l-11-4.5L31 46Z" fill="var(--lm-logo-detail, white)" />
      <path d="M56 42q9 12 18 0" stroke="var(--lm-logo-detail, white)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

