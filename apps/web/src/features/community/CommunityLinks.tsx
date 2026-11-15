import { Link } from 'react-router';
import { Users } from 'lucide-react';
import { CropImage, cropLabel } from '@/components/CropVisual';
import { useCropMap } from '@/hooks/queries';
import { useFarmCommunityArea } from './CommunityAreaContext';

/**
 * Optional links from the Rotation Lab into the Community. Deliberately separate from the
 * analysis: community posts never change ratings, suitability or ordering.
 */
export function CommunityLinks({ cropIds, fallbackCountry }: { cropIds: string[]; fallbackCountry: string | null }) {
  const { map } = useCropMap();
  const area = useFarmCommunityArea();
  const country = area.data?.area.countryName ?? fallbackCountry;
  if (!cropIds.length) return null;
  return (
    <section className="rounded-3xl border-2 border-dashed border-forest-900/15 bg-cream-50 p-5 sm:p-6" aria-labelledby="community-links-title" data-testid="community-links">
      <div className="flex items-start gap-3">
        <Users className="size-7 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <h2 id="community-links-title" className="text-xl">
            What other farmers say
          </h2>
          <p className="text-sm font-semibold text-[#6d4f12]">Community experiences — not verified crop recommendations.</p>
          <p className="text-sm text-ink-muted">They do not change the comparison above.</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cropIds.map((id) => (
          <li key={id}>
            <Link
              to={`/community?crop=${encodeURIComponent(id)}&scope=country`}
              className="flex items-center gap-3 rounded-2xl border border-forest-900/10 bg-white p-3 text-sm font-semibold hover:border-emerald-600"
              data-testid={`community-link-${id}`}
            >
              <CropImage crop={map.get(id)} cropId={id} size={40} className="rounded-lg" />
              <span>
                See experiences from farmers growing {cropLabel(map, id).replace(/\s*\(.*\)/, '').toLowerCase()}
                {country ? ` in ${country}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
