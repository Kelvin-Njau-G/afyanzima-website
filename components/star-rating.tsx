'use client';

import { useState } from 'react';

const LABELS = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent'];

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z"
        fill={filled ? '#F5B301' : 'none'}
        stroke={filled ? '#F5B301' : '#9CA3AF'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Read-only stars, e.g. in the admin review list. */
export function Stars({ value, size = 'size-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= value} className={size} />
      ))}
    </span>
  );
}

/**
 * Pick-a-rating control. Built on real radio buttons, so it works with the
 * keyboard (arrow keys) and screen readers as well as taps.
 */
export default function StarRatingInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-gray-900">Your rating</legend>
      <div className="flex items-center gap-3">
        <div className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="cursor-pointer p-1 has-[:focus-visible]:rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#006CB5]"
              onMouseEnter={() => setHover(n)}
            >
              <input
                type="radio"
                name="rating"
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                aria-label={`${n} star${n === 1 ? '' : 's'}: ${LABELS[n - 1]}`}
              />
              <Star filled={n <= shown} className="size-9 sm:size-10" />
            </label>
          ))}
        </div>
        <span className="text-sm text-gray-600" aria-live="polite">
          {shown ? LABELS[shown - 1] : 'Tap a star'}
        </span>
      </div>
    </fieldset>
  );
}
