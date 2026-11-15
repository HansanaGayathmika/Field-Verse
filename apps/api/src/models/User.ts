import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    /** scrypt hash in the format "scrypt$N$r$p$saltB64$hashB64" — never plain text or bare SHA-256. */
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['farmer', 'extension_officer', 'moderator', 'admin'], default: 'farmer' },
    language: { type: String, default: 'en', maxlength: 10 },
    preferences: {
      lowBandwidth: { type: Boolean, default: false },
      units: { type: String, enum: ['metric'], default: 'metric' },
    },
  },
  { timestamps: true },
);
userSchema.index({ email: 1 }, { unique: true });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
