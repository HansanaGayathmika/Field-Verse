import { Schema, model, type InferSchemaType } from 'mongoose';

const constraintSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['no_irrigation', 'seeds_unavailable', 'soil_floods', 'cannot_sell', 'lacks_equipment', 'crop_failed_before', 'excluded_crop'],
      required: true,
    },
    cropId: { type: String, default: null },
    note: { type: String, maxlength: 280, default: null },
  },
  { _id: false },
);

const fieldSchema = new Schema(
  {
    /** Owner: a registered user id ("user:<id>") or anonymous guest id ("guest:<uuid>"). */
    ownerKey: { type: String, required: true },
    ownerType: { type: String, enum: ['user', 'guest'], required: true },
    farmName: { type: String, required: true, trim: true, maxlength: 80 },
    regionId: { type: String, required: true, maxlength: 64 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (v: number[]) => v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
          message: 'location.coordinates must be [longitude, latitude]',
        },
      },
    },
    polygon: {
      type: { type: String, enum: ['Polygon'] },
      coordinates: { type: [[[Number]]], default: undefined },
    },
    currentCrop: { type: String, required: true, maxlength: 64 },
    cropHistory: { type: [String], default: [] },
    soil: {
      type: { type: String, enum: ['clay', 'loam', 'sandy', 'silt', 'unknown'], default: 'unknown' },
      ph: { type: Number, min: 3, max: 10, default: null },
    },
    irrigation: { type: String, enum: ['none', 'limited', 'full', 'unknown'], default: 'unknown' },
    /** 1–12, "harvested", or null (I do not know). */
    harvestMonth: { type: Schema.Types.Mixed, default: null },
    nextPlantingMonth: { type: Number, min: 1, max: 12, default: null },
    seasonsPerYear: { type: Number, enum: [1, 2, 3, null], default: null },
    waterlogging: { type: String, enum: ['several_weeks', 'few_days', 'drains_well', 'unknown'], default: 'unknown' },
    inputLevel: { type: String, enum: ['minimal', 'moderate', 'high', 'unknown'], default: 'unknown' },
    excludedCrops: { type: [String], default: [] },
    areaHectares: { type: Number, min: 0, default: null },
    priorities: {
      water: { type: Number, min: 0, max: 1, required: true },
      soilHealth: { type: Number, min: 0, max: 1, required: true },
      risk: { type: Number, min: 0, max: 1, required: true },
      income: { type: Number, min: 0, max: 1, required: true },
      idleLand: { type: Number, min: 0, max: 1, default: 0 },
      foodSecurity: { type: Number, min: 0, max: 1, default: 0 },
    },
    constraints: { type: [constraintSchema], default: [] },
    /** Only set for GUEST records (temporary). Registered users' fields never expire. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

fieldSchema.index({ ownerKey: 1, updatedAt: -1 });
fieldSchema.index({ location: '2dsphere' });
// TTL applies ONLY to documents with an expiresAt date (guest demo data). Permanent records have none.
fieldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { ownerType: 'guest' } });

export type FieldShape = InferSchemaType<typeof fieldSchema>;
export const Field = model('Field', fieldSchema);
