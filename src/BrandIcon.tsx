/**
 * The Plamenix Firebird-IDE brand mark — a stylised phoenix flame.
 * Source: `plamenix-branding/assets/icon.svg`, transcribed inline so
 * the React library has no asset-resolution dependency on the sibling
 * branding repo. Updates to the source SVG must be mirrored here.
 *
 * Rendered as a self-contained `<svg>` with internal gradients; safe
 * to drop multiple instances on the same page (the `<defs>` ids are
 * suffixed by a render-time stable token to keep them unique).
 */

import { useId } from 'react';

export interface BrandIconProps {
  /** Tailwind size classes (e.g. `h-10 w-10`). Defaults to `h-8 w-8`. */
  className?: string;
  /** Accessible label. Defaults to `'Plamenix'`. */
  title?: string;
}

export function BrandIcon({ className = 'h-8 w-8', title = 'Plamenix' }: BrandIconProps) {
  const uid = useId();
  const outerId = `flame-outer-${uid}`;
  const innerId = `flame-inner-${uid}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 144 144"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <radialGradient id={outerId} cx="50%" cy="78%" r="58%" fx="50%" fy="78%">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="14%" stopColor="#FEF08A" />
          <stop offset="32%" stopColor="#FBBF24" />
          <stop offset="55%" stopColor="#F97316" />
          <stop offset="80%" stopColor="#DC2626" />
          <stop offset="100%" stopColor="#7F1D1D" />
        </radialGradient>
        <radialGradient id={innerId} cx="50%" cy="80%" r="48%" fx="50%" fy="80%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="22%" stopColor="#FDE047" />
          <stop offset="55%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#DC2626" />
        </radialGradient>
      </defs>
      <path
        fill={`url(#${outerId})`}
        d="M117 87.03c0 27.45-22.725 49.5225-50.175 47.8845-28.21-1.683-47.52-28.8135-43.884-57.1725 2.2005-17.2485 10.287-32.04 19.089-43.515 1.53-2.0025 3.1005 14.112 4.671 12.339 1.575-1.8225 16.173-27.0855 21.249-35.9595a3.123 3.123 0 0 1 4.626-.9585C82.773 17.343 117 46.2465 117 87.03Z"
      />
      <path
        fill={`url(#${innerId})`}
        d="M103.5 98.3295c0 18.189-15.8355 32.8095-35.0955 32.148-20.79-.702-35.046-19.728-31.995-39.3255C40.815 63.054 69.66 45 69.66 45S103.5 66.1815 103.5 98.3295Z"
      />
    </svg>
  );
}
