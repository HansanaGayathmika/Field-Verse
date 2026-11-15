import { Schema, model } from 'mongoose';

/** Reference collections. Seeded from versioned fixtures in /data/demo (see seeds/seed.ts). */
const cropSchema = new Schema(
  {
    cropId: { type: String, required: true },
    names: { type: Schema.Types.Mixed, required: true },
    scientificName: { type: String, default: null },
    family: { type: String, default: null },
    category: { type: String, enum: ['cereal', 'legume', 'cover', 'root'], required: true },
    image: { src: String, alt: String, credit: String },
    description: { type: String, required: true },
    roles: [String],
    characteristics: { type: Schema.Types.Mixed, required: true },
    regions: [String],
    source: { sourceType: String, name: String, note: String },
  },
  { timestamps: true },
);
cropSchema.index({ cropId: 1 }, { unique: true });
export const CropModel = model('Crop', cropSchema);

const regionSchema = new Schema(
  {
    regionId: { type: String, required: true },
    country: { type: String, required: true },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    supportedCrops: [String],
    demoDataRef: { type: String, required: true },
    dataStatus: { type: Schema.Types.Mixed, required: true },
    /** Full display document (validated against RegionSchema from @fieldverse/contracts). */
    content: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
regionSchema.index({ regionId: 1 }, { unique: true });
regionSchema.index({ location: '2dsphere' });
export const RegionModel = model('Region', regionSchema);
