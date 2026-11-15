import { Schema, Types, model, type InferSchemaType } from 'mongoose';

/**
 * Server-side sessions. The cookie holds only a random token; we store its SHA-256 hash.
 * Sessions are temporary by nature, so a TTL index on `expiresAt` is appropriate here.
 */
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Types.ObjectId, ref: 'User', default: null },
    /** Random owner id for anonymous demo users (guest). */
    guestId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionShape = InferSchemaType<typeof sessionSchema>;
export const Session = model('Session', sessionSchema);
