/**
 * Seeds reference collections (regions, crops) from the versioned fixtures in /data/demo.
 * Idempotent: upserts by id. Never touches user data.
 *   npm run seed
 */
import { env } from '../config/env';
import { connectDb, disconnectDb } from '../config/db';
import { referenceData } from '../services/referenceData';
import { CropModel, RegionModel } from '../models/Reference';
import { Field } from '../models/Field';
import { SavedScenario } from '../models/SavedScenario';
import { Session } from '../models/Session';
import { EngineCache } from '../models/EngineCache';
import { User } from '../models/User';
import { CommunityExperience, CommunityReaction, CommunityReport } from '../models/Community';

export async function seedReferenceData() {
  referenceData.reload();
  const regions = referenceData.listRegions();
  const crops = referenceData.listCrops();
  for (const r of regions) {
    const bundle = referenceData.getBundle(r.id)!;
    const { media: _media, ...content } = r;
    await RegionModel.updateOne(
      { regionId: r.id },
      {
        $set: {
          regionId: r.id,
          country: r.country,
          location: { type: 'Point', coordinates: [r.longitude, r.latitude] },
          supportedCrops: r.supportedCrops,
          demoDataRef: `data/demo/${bundle.folder}`,
          dataStatus: r.dataStatus,
          content,
        },
      },
      { upsert: true },
    );
  }
  for (const c of crops) {
    const { id, ...rest } = c;
    await CropModel.updateOne({ cropId: id }, { $set: { cropId: id, ...rest } }, { upsert: true });
  }
  // Ensure indexes (including TTL + 2dsphere) exist.
  await Promise.all([RegionModel, CropModel, Field, SavedScenario, Session, EngineCache, User, CommunityExperience, CommunityReaction, CommunityReport].map((m) => m.syncIndexes()));
  return { regions: regions.length, crops: crops.length };
}

const isMain = process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  (async () => {
    if (!env.MONGODB_URI) {
      console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
      process.exit(1);
    }
    const ok = await connectDb();
    if (!ok) {
      console.error('Could not connect to MongoDB at', env.MONGODB_URI, '— start it with "npm run db:memory" or Docker Compose.');
      process.exit(1);
    }
    const r = await seedReferenceData();
    console.log(`✓ Seeded ${r.regions} regions and ${r.crops} crops.`);
    await disconnectDb();
    process.exit(0);
  })();
}
