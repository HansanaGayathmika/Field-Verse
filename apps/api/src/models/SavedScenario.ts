import { Schema, Types, model } from 'mongoose';

const savedScenarioSchema = new Schema(
  {
    ownerKey: { type: String, required: true },
    ownerType: { type: String, enum: ['user', 'guest'], required: true },
    title: { type: String, required: true, maxlength: 120 },
    fieldId: { type: Types.ObjectId, ref: 'Field', default: null },
    regionId: { type: String, required: true },
    farmerInputs: { type: Schema.Types.Mixed, required: true },
    scenario: {
      rainfallChangePercent: { type: Number, required: true },
      temperatureChangeCelsius: { type: Number, required: true },
    },
    analysis: { type: Schema.Types.Mixed, required: true },
    mode: { type: String, enum: ['demo', 'remote'], required: true },
    modelVersion: { type: String, default: null },
    analysisRequestId: { type: String, default: null },
    analysisGeneratedAt: { type: String, default: null },
    sourceIds: { type: [String], default: [] },
    notes: { type: String, maxlength: 1000, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);
savedScenarioSchema.index({ ownerKey: 1, createdAt: -1 });
savedScenarioSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { ownerType: 'guest' } });

export const SavedScenario = model('SavedScenario', savedScenarioSchema);
