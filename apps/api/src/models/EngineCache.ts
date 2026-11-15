import { Schema, model } from 'mongoose';

/** Temporary cache of analysis responses. TTL index is appropriate: this is NOT user data. */
const engineCacheSchema = new Schema({
  key: { type: String, required: true },
  provider: { type: String, enum: ['demo', 'remote'], required: true },
  modelVersion: { type: String, default: null },
  operation: { type: String, required: true },
  response: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
engineCacheSchema.index({ key: 1 }, { unique: true });
engineCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EngineCache = model('EngineCache', engineCacheSchema);
