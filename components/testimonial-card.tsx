import type { PublicTestimonial } from '@/lib/testimonials/shared';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

/** Past roughly this length the card text is cut short and "Read more" opens the full quote. */
const LONG = 320;

function Byline({ t }: { t: PublicTestimonial }) {
  return (
    <div>
      <p className="text-lg font-bold text-[#006CB5]">{t.directorName}</p>
      <p className="text-[#111827]">Director, {t.facilityName}</p>
    </div>
  );
}

export default function TestimonialCard({ t }: { t: PublicTestimonial }) {
  const isLong = t.comment.length > LONG;

  return (
    <figure className="flex w-full flex-col justify-between gap-8 rounded-2xl bg-white p-6 text-[#111827] shadow-[0px_4px_4px_rgba(0,0,0,0.1)] sm:p-8">
      <div className="space-y-4">
        <span aria-hidden="true" className="block text-6xl font-bold leading-none text-[#E63323]">
          “
        </span>
        <blockquote className="line-clamp-[8] whitespace-pre-line text-lg leading-relaxed">{t.comment}</blockquote>
        {isLong && (
          <Dialog>
            <DialogTrigger className="text-sm font-bold text-[#006CB5] underline">Read more</DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl p-6 max-sm:max-w-[90vw] sm:max-w-2xl sm:p-10">
              <DialogTitle className="sr-only">
                Testimonial from {t.directorName}, {t.facilityName}
              </DialogTitle>
              <span aria-hidden="true" className="block text-6xl font-bold leading-none text-[#E63323]">
                “
              </span>
              <blockquote className="mb-6 whitespace-pre-line text-lg leading-relaxed text-[#111827]">
                {t.comment}
              </blockquote>
              <Byline t={t} />
            </DialogContent>
          </Dialog>
        )}
      </div>
      <figcaption>
        <Byline t={t} />
      </figcaption>
    </figure>
  );
}
