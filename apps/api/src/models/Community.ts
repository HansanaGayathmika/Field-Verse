import { Schema, Types, model } from 'mongoose';

/**
 * Community collections. PRIVATE internal shapes — never returned directly to clients
 * (see services/communityDto.ts for the explicit public DTOs).
 * No coordinates are ever stored here: only the administrative area level the farmer chose to publish.
 */
const publicLocationSchema = new Schema(
  {
    countryCode: { type: String, required: true, uppercase: true, match: /^[A-Z]{2}$/ },
    countryName: { type: String, required: true, maxlength: 100 },
    admin1Code: { type: String, default: null, maxlength: 60 },
    admin1Name: { type: String, default: null, maxlength: 120 },
    admin2Code: { type: String, default: null, maxlength: 140 },
    admin2Name: { type: String, default: null, maxlength: 120 },
    visibilityLevel: { type: String, enum: ['admin2', 'admin1', 'country'], required: true },
  },
  { _id: false },
);

const experienceSchema = new Schema(
  {
    /** Internal owner reference — never exposed publicly. */
    ownerId: { type: Types.ObjectId, ref: 'User', required: true },
    publicLocation: { type: publicLocationSchema, required: true },
    cropId: { type: String, default: null, maxlength: 64 },
    category: {
      type: String,
      enum: ['crop_cultivation', 'crop_rotation', 'irrigation', 'soil_improvement', 'pests_diseases', 'flooding', 'drought', 'harvesting', 'seeds_planting', 'other'],
      required: true,
    },
    title: { type: String, default: null, maxlength: 100 },
    description: { type: String, required: true, maxlength: 2000 },
    lessonsLearned: { type: String, default: null, maxlength: 1000 },
    season: { type: String, default: null, maxlength: 40 },
    approximateYear: { type: Number, default: null },
    irrigationMethod: { type: String, enum: ['rainfed', 'tank_canal', 'well_pump', 'drip_sprinkler', 'other', 'unknown', null], default: null },
    soilNotes: { type: String, default: null, maxlength: 300 },
    weatherNotes: { type: String, default: null, maxlength: 300 },
    moderationStatus: { type: String, enum: ['pending', 'published', 'hidden', 'removed'], required: true, default: 'pending' },
    /** Shown to the OWNER only (e.g. why a post was hidden). Never public. */
    moderationMessage: { type: String, default: null, maxlength: 300 },
    moderatedBy: { type: Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    helpfulCount: { type: Number, default: 0, min: 0 },
    openReportCount: { type: Number, default: 0, min: 0 },
    edited: { type: Boolean, default: false },
    /** Explicitly labelled demonstration fixture (none are created by default). */
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Feed queries: status + geography + filters + recency.
experienceSchema.index({ moderationStatus: 1, 'publicLocation.countryCode': 1, 'publicLocation.admin1Code': 1, 'publicLocation.admin2Code': 1, createdAt: -1 });
experienceSchema.index({ moderationStatus: 1, cropId: 1, createdAt: -1 });
experienceSchema.index({ moderationStatus: 1, category: 1, createdAt: -1 });
experienceSchema.index({ moderationStatus: 1, helpfulCount: -1 });
experienceSchema.index({ ownerId: 1, createdAt: -1 });
experienceSchema.index({ title: 'text', description: 'text', lessonsLearned: 'text' }, { weights: { title: 5, description: 2, lessonsLearned: 1 }, name: 'experience_text' });

export const CommunityExperience = model('CommunityExperience', experienceSchema, 'communityExperiences');

const reactionSchema = new Schema(
  {
    experienceId: { type: Types.ObjectId, ref: 'CommunityExperience', required: true },
    userId: { type: Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['helpful'], default: 'helpful' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
// One helpful reaction per account per post.
reactionSchema.index({ experienceId: 1, userId: 1, type: 1 }, { unique: true });
export const CommunityReaction = model('CommunityReaction', reactionSchema, 'communityReactions');

const reportSchema = new Schema(
  {
    experienceId: { type: Types.ObjectId, ref: 'CommunityExperience', required: true },
    reporterId: { type: Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['spam', 'misleading', 'abusive', 'personal_info', 'inappropriate_image', 'other'], required: true },
    details: { type: String, default: null, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true },
);
// One open report per account per post (prevents report flooding by one person).
reportSchema.index({ experienceId: 1, reporterId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
export const CommunityReport = model('CommunityReport', reportSchema, 'communityReports');
