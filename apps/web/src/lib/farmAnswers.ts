import type { TFunction } from 'i18next';
import type { Crop } from '@fieldverse/contracts';
import type { FarmProfile } from '@/contexts/FarmContext';
import { cropLabel } from '@/components/CropVisual';
import { monthName } from '@/lib/utils';

/** Plain-language descriptions of the farmer's answers (spec wording), shared by review, dashboard and decision card. */
export function describeAnswers(p: Pick<FarmProfile, 'currentCrop' | 'cropHistory' | 'harvestMonth' | 'nextPlantingMonth' | 'seasonsPerYear' | 'irrigation' | 'waterlogging' | 'inputLevel' | 'soilType' | 'soilPh' | 'excludedCrops'>, t: TFunction, cropMap: Map<string, Crop>) {
  const crop = (id: string) => (id === 'fallow' ? t('form.currentCrop.fallow') : cropLabel(cropMap, id));
  const seasons = { 1: t('form.seasons.one'), 2: t('form.seasons.two'), 3: t('form.seasons.three') } as const;
  return [
    { key: 'current_crop', label: t('form.currentCrop.label'), value: crop(p.currentCrop), unknown: false },
    {
      key: 'harvest_month',
      label: t('form.harvestMonth.label'),
      value: p.currentCrop === 'fallow' ? '—' : p.harvestMonth === 'harvested' ? t('form.harvestMonth.harvested') : p.harvestMonth ? monthName(p.harvestMonth, 'en', 'long') : t('form.harvestMonth.unknown'),
      unknown: p.currentCrop !== 'fallow' && p.harvestMonth == null,
    },
    { key: 'previous_crop', label: t('form.previousCrop.label'), value: p.cropHistory[0] ? crop(p.cropHistory[0]) : t('form.previousCrop.unknown'), unknown: !p.cropHistory[0] },
    { key: 'previous_crop_2', label: t('form.previousCrop2.label'), value: p.cropHistory[1] ? crop(p.cropHistory[1]) : t('form.previousCrop.unknown'), unknown: !p.cropHistory[1] },
    { key: 'next_planting_month', label: t('form.nextPlanting.label'), value: p.nextPlantingMonth ? monthName(p.nextPlantingMonth, 'en', 'long') : t('form.nextPlanting.unsure'), unknown: p.nextPlantingMonth == null },
    { key: 'seasons_per_year', label: t('form.seasons.label'), value: p.seasonsPerYear ? seasons[p.seasonsPerYear] : t('form.seasons.unsure'), unknown: p.seasonsPerYear == null },
    { key: 'water_access', label: t('form.water.label'), value: t(`form.water.${p.irrigation}`), unknown: p.irrigation === 'unknown' },
    { key: 'waterlogging', label: t('form.waterlogging.label'), value: t(`form.waterlogging.${p.waterlogging}`), unknown: p.waterlogging === 'unknown' },
    { key: 'input_level', label: t('form.inputs.label'), value: t(`form.inputs.${p.inputLevel}`), unknown: p.inputLevel === 'unknown' },
    { key: 'soil_texture', label: t('form.soil.label'), value: t(`form.soil.${p.soilType}`), unknown: p.soilType === 'unknown' },
    { key: 'soil_ph', label: t('form.ph.label'), value: p.soilPh != null ? String(p.soilPh) : 'Not entered', unknown: false },
    { key: 'excluded_crops', label: t('form.exclude.label'), value: p.excludedCrops.length ? p.excludedCrops.map(crop).join(', ') : 'None', unknown: false },
  ];
}
