/**
 * THE crop list for the recommendation form and results. Keep it in this one file:
 * the engine's crop list will grow, and everything in the UI is driven from here.
 *
 * Dryland rice and cassava from the earlier form spec are intentionally NOT supported.
 * `icon` points at existing artwork in /public/crops when there is a close match (optional).
 */
export const CROPS = [
  { id: 'wetland_rice', name: 'Wetland (paddy) rice', icon: '/crops/rice.svg' },
  { id: 'maize', name: 'Maize', icon: '/crops/maize.svg' },
  { id: 'soybean', name: 'Soybean', icon: '/crops/soybean.svg' },
  { id: 'wheat', name: 'Wheat', icon: '/crops/wheat.svg' },
  { id: 'sorghum', name: 'Sorghum', icon: '/crops/sorghum.svg' },
  { id: 'pearl_millet', name: 'Pearl millet', icon: null },
  { id: 'phaseolus_bean', name: 'Common bean', icon: '/crops/common-bean.svg' },
  { id: 'cowpea', name: 'Cowpea', icon: '/crops/cowpea.svg' },
  { id: 'pigeonpea', name: 'Pigeonpea', icon: null },
  { id: 'groundnut', name: 'Groundnut', icon: null },
  { id: 'sesame', name: 'Sesame', icon: null },
  { id: 'sweet_potato', name: 'Sweet potato', icon: null },
] as const;

export type CropId = (typeof CROPS)[number]['id'];

const BY_ID = new Map<string, (typeof CROPS)[number]>(CROPS.map((c) => [c.id, c]));

export const isCropId = (id: unknown): id is CropId => typeof id === 'string' && BY_ID.has(id);

/** Display name for any crop id the engine sends, including ids added after this file was written. */
export function cropName(id: string): string {
  return BY_ID.get(id)?.name ?? id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
export const cropIcon = (id: string): string | null => BY_ID.get(id)?.icon ?? null;
