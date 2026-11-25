'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

/**
 * A single row of cards that scrolls sideways: 3 at a time on desktop, 1 on
 * mobile. Arrow buttons move a full "page" of cards; swiping and trackpad
 * scrolling work too, and cards snap into place.
 */
export default function CardCarousel({
  children,
  label,
}: {
  children: React.ReactNode;
  /** Read out by screen readers, e.g. "AfyaNzima pharmacies". */
  label: string;
}) {
  const items = Children.toArray(children);
  const total = items.length;

  const track = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(1);
  const [first, setFirst] = useState(0); // index of the left-most visible card

  /** Card width + gap, read from the DOM so it follows the CSS breakpoints. */
  const step = useCallback(() => {
    const el = track.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return 0;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    return card.offsetWidth + gap;
  }, []);

  const measure = useCallback(() => {
    const el = track.current;
    const s = step();
    if (!el || !s) return;
    setPerView(Math.max(1, Math.round((el.clientWidth + (s - (el.firstElementChild as HTMLElement).offsetWidth)) / s)));
    setFirst(Math.round(el.scrollLeft / s));
  }, [step]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);

  const lastStart = Math.max(0, total - perView);
  const atStart = first <= 0;
  const atEnd = first >= lastStart;
  const pages = Math.ceil(total / perView);
  const page = atEnd ? pages - 1 : Math.floor(first / perView);

  function goTo(index: number) {
    const el = track.current;
    if (!el) return;
    const target = Math.min(Math.max(index, 0), lastStart);
    el.scrollTo({ left: target * step(), behavior: 'smooth' });
  }

  const shownFrom = Math.min(first + 1, total);
  const shownTo = Math.min(first + perView, total);

  const arrow =
    'grid size-11 place-items-center rounded-full bg-[#006CB5] text-white shadow-lg transition hover:bg-[#00528a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006CB5] disabled:pointer-events-none disabled:opacity-0';

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="relative">
        <div
          ref={track}
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-2 outline-none [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-8 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${total}`}
              className="flex shrink-0 basis-full snap-start sm:basis-[calc((100%-4rem)/3)]"
            >
              {item}
            </div>
          ))}
        </div>

        {/* Desktop: arrows sit on the left and right edges of the row. */}
        {total > perView && (
          <>
            <button
              type="button"
              onClick={() => goTo(first - perView)}
              disabled={atStart}
              aria-label="Show previous"
              className={`${arrow} absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 max-sm:hidden`}
            >
              <ArrowLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo(first + perView)}
              disabled={atEnd}
              aria-label="Show more"
              className={`${arrow} absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 max-sm:hidden`}
            >
              <ArrowRightIcon className="size-5" />
            </button>
          </>
        )}
      </div>

      {total > perView && (
        <div className="mt-6 flex items-center justify-center gap-4">
          {/* Mobile: arrows sit either side of the position indicator. */}
          <button
            type="button"
            onClick={() => goTo(first - perView)}
            disabled={atStart}
            aria-label="Show previous"
            className={`${arrow} disabled:!opacity-30 sm:hidden`}
          >
            <ArrowLeftIcon className="size-5" />
          </button>

          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2" aria-hidden="true">
              {Array.from({ length: pages }, (_, p) => (
                <button
                  key={p}
                  type="button"
                  tabIndex={-1}
                  onClick={() => goTo(p * perView)}
                  className={`h-2 rounded-full transition-all ${
                    p === page ? 'w-6 bg-[#006CB5]' : 'w-2 bg-[#006CB5]/25'
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600" aria-live="polite">
              {perView === 1 ? `${shownFrom} of ${total}` : `${shownFrom}–${shownTo} of ${total}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => goTo(first + perView)}
            disabled={atEnd}
            aria-label="Show more"
            className={`${arrow} disabled:!opacity-30 sm:hidden`}
          >
            <ArrowRightIcon className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
