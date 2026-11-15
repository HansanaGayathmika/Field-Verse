import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { setGeocodeFetch } from '../src/services/geocode';
import { CommunityExperience, CommunityReaction, CommunityReport } from '../src/models/Community';
import { User } from '../src/models/User';
import { detectPersonalInfo } from '@fieldverse/contracts';

/**
 * Community feature: geographic ranking, server-side anonymity, ownership,
 * helpful reactions, reports and moderation. Real mongod (mongodb-memory-server).
 */
let mongo: MongoMemoryServer | null = null;
let available = false;
const app = createApp();
const H = { 'X-FieldVerse-Client': '1' };

// Realistic Nominatim reverse-geocoding answers keyed by latitude.
const PLACES: Record<string, Record<string, string>> = {
  '8.31': { state_district: 'Anuradhapura District', 'ISO3166-2-lvl5': 'LK-71', state: 'North Central Province', 'ISO3166-2-lvl4': 'LK-7', country: 'Sri Lanka', country_code: 'lk' },
  '7.94': { state_district: 'Polonnaruwa District', 'ISO3166-2-lvl5': 'LK-72', state: 'North Central Province', 'ISO3166-2-lvl4': 'LK-7', country: 'Sri Lanka', country_code: 'lk' },
  '6.93': { state_district: 'Colombo District', 'ISO3166-2-lvl5': 'LK-11', state: 'Western Province', 'ISO3166-2-lvl4': 'LK-1', country: 'Sri Lanka', country_code: 'lk' },
  '8.05': { state: 'North Central Province', 'ISO3166-2-lvl4': 'LK-7', country: 'Sri Lanka', country_code: 'lk' }, // no district
  '-0.33': { county: 'Njoro', state: 'Nakuru', 'ISO3166-2-lvl4': 'KE-31', country: 'Kenya', country_code: 'ke' },
};

beforeAll(async () => {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('fieldverse-community-test'));
    await Promise.all([CommunityExperience, CommunityReaction, CommunityReport, User].map((m) => m.syncIndexes()));
    available = true;
  } catch (err) {
    console.warn(`⚠ Skipping community tests: ${(err as Error).message}`);
  }
  setGeocodeFetch(
    vi.fn(async (url: string) => {
      const lat = new URL(url).searchParams.get('lat')!;
      const address = PLACES[String(Number(lat))] ?? {};
      return new Response(JSON.stringify({ address }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch,
  );
});

afterAll(async () => {
  setGeocodeFetch(null);
  await mongoose.disconnect().catch(() => undefined);
  await mongo?.stop().catch(() => undefined);
});

beforeEach(async () => {
  if (!available) return;
  await Promise.all([CommunityExperience.deleteMany({}), CommunityReaction.deleteMany({}), CommunityReport.deleteMany({})]);
});

let n = 0;
async function newUser(role: 'farmer' | 'moderator' = 'farmer') {
  const agent = request.agent(app);
  const email = `farmer${++n}-${Date.now()}@example.org`;
  const r = await agent.post('/api/v1/auth/register').set(H).send({ name: `Secret Name ${n}`, email, password: 'a long test password' });
  expect(r.status).toBe(201);
  if (role !== 'farmer') await User.updateOne({ email }, { $set: { role } });
  const user = await User.findOne({ email }).lean();
  return { agent, email, id: String(user!._id), name: `Secret Name ${n}` };
}

async function resolve(lat: number) {
  const r = await request(app).get(`/api/v1/community/locations/resolve?lat=${lat}&lon=80.4`);
  expect(r.status).toBe(200);
  return r.body as { area: any; areaToken: string; levelLabels: any };
}

const body = (area: any, areaToken: string, extra: Record<string, unknown> = {}) => ({
  area,
  areaToken,
  visibilityLevel: 'admin2',
  cropId: 'rice',
  category: 'crop_rotation',
  description: 'After the Maha rice harvest I planted mung bean using the April rains. Drainage mattered a lot.',
  ...extra,
});

/** Creates a post and (by default) approves it through the moderation API. */
async function publish(owner: Awaited<ReturnType<typeof newUser>>, lat: number, extra: Record<string, unknown> = {}, moderator?: Awaited<ReturnType<typeof newUser>>) {
  const r = await resolve(lat);
  const res = await owner.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, extra));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const mod = moderator ?? (await newUser('moderator'));
  const ok = await mod.agent.patch(`/api/v1/community/moderation/${res.body.experience.id}`).set(H).send({ status: 'published' });
  expect(ok.status).toBe(200);
  return res.body.experience.id as string;
}

describe('location resolution', () => {
  it('returns ISO-coded administrative areas and never echoes coordinates', async ({ skip }) => {
    if (!available) skip();
    const r = await resolve(8.31);
    expect(r.area).toEqual({ countryCode: 'LK', countryName: 'Sri Lanka', admin1Code: 'LK-7', admin1Name: 'North Central Province', admin2Code: 'LK-71', admin2Name: 'Anuradhapura District' });
    expect(r.levelLabels).toEqual({ admin1: 'Province', admin2: 'District' });
    expect(JSON.stringify(r)).not.toMatch(/8\.31|80\.4/);
  });
  it('derives stable codes where no ISO subdivision code exists (Kenya sub-county)', async ({ skip }) => {
    if (!available) skip();
    const r = await resolve(-0.33);
    expect(r.area).toMatchObject({ countryCode: 'KE', admin1Code: 'KE-31', admin2Code: 'KE-31:njoro', admin2Name: 'Njoro' });
    expect(r.levelLabels.admin1).toBe('County');
  });
  it('falls back to a broader area when the district cannot be resolved', async ({ skip }) => {
    if (!available) skip();
    const r = await resolve(8.05);
    expect(r.area).toMatchObject({ admin1Code: 'LK-7', admin2Code: null });
  });
});

describe('geographic relevance ranking', () => {
  it('orders same district → same province → same country → other countries', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const mod = await newUser('moderator');
    // Created in reverse order of relevance so recency cannot explain the result.
    const kenya = await publish(a, -0.33, {}, mod);
    const colombo = await publish(a, 6.93, { description: 'In Colombo district we grew vegetables in home gardens with careful watering.' }, mod);
    const polonnaruwa = await publish(a, 7.94, { description: 'In Polonnaruwa the tank water ran short so we tried cowpea in Yala season.' }, mod);
    const anuradhapura = await publish(a, 8.31, { description: 'In Anuradhapura our paddy field drained slowly after rain, so mung bean struggled.' }, mod);

    const viewer = await resolve(8.31);
    const qs = new URLSearchParams({ countryCode: 'LK', admin1Code: viewer.area.admin1Code, admin2Code: viewer.area.admin2Code, scope: 'world' });
    const r = await request(app).get(`/api/v1/community/experiences?${qs}`);
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: any) => i.id)).toEqual([anuradhapura, polonnaruwa, colombo, kenya]);
    expect(r.body.items.map((i: any) => i.relevance.level)).toEqual([1, 2, 3, 4]);
    expect(r.body.items[0].relevance.reason).toBe('Shared in Anuradhapura District');
    expect(r.body.items[1].relevance.reason).toBe('Elsewhere in North Central Province');
    expect(r.body.levelCounts).toEqual({ admin2: 1, admin1: 2, country: 3, world: 4 });
  });

  it('auto scope adds other countries only when local results are few; country scope never does', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const mod = await newUser('moderator');
    await publish(a, -0.33, { description: 'In Njoro the short rains were late, so we planted beans in late October.' }, mod);
    await publish(a, 8.31, {}, mod);
    const base = { countryCode: 'LK', admin1Code: 'LK-7', admin2Code: 'LK-71' };
    const auto = await request(app).get(`/api/v1/community/experiences?${new URLSearchParams({ ...base, scope: 'auto' })}`);
    expect(auto.body.includedOtherCountries).toBe(true); // fewer than 5 in Sri Lanka
    expect(auto.body.items).toHaveLength(2);
    const country = await request(app).get(`/api/v1/community/experiences?${new URLSearchParams({ ...base, scope: 'country' })}`);
    expect(country.body.includedOtherCountries).toBe(false);
    expect(country.body.items.every((i: any) => i.publicLocation.countryCode === 'LK')).toBe(true);
  });

  it('a viewer whose district is unknown still gets province-level matches first', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const mod = await newUser('moderator');
    const colombo = await publish(a, 6.93, {}, mod);
    const anuradhapura = await publish(a, 8.31, { description: 'A North Central experience about tank irrigation and rice in Maha season.' }, mod);
    const r = await request(app).get(`/api/v1/community/experiences?${new URLSearchParams({ countryCode: 'LK', admin1Code: 'LK-7', scope: 'country' })}`);
    expect(r.body.items.map((i: any) => i.id)).toEqual([anuradhapura, colombo]);
    expect(r.body.items[0].relevance.level).toBe(2);
  });

  it('filters by crop and category, searches text, sorts and paginates', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const mod = await newUser('moderator');
    await publish(a, 8.31, { cropId: 'mung-bean', category: 'crop_rotation', description: 'Mung bean after rice worked when the field drained well in April.' }, mod);
    await publish(a, 8.31, { cropId: 'rice', category: 'irrigation', description: 'Our tank irrigation schedule changed and Yala rice needed careful water sharing.' }, mod);
    await publish(a, 8.31, { cropId: 'maize', category: 'drought', description: 'Maize suffered during a dry spell in June and the cobs were small.' }, mod);
    const q = (p: Record<string, string>) => request(app).get(`/api/v1/community/experiences?${new URLSearchParams({ countryCode: 'LK', admin1Code: 'LK-7', admin2Code: 'LK-71', ...p })}`);

    expect((await q({ cropId: 'mung-bean' })).body.items.map((i: any) => i.cropId)).toEqual(['mung-bean']);
    expect((await q({ category: 'drought' })).body.items.map((i: any) => i.cropId)).toEqual(['maize']);
    expect((await q({ q: 'tank irrigation' })).body.items[0].cropId).toBe('rice');
    const page1 = await q({ pageSize: '2', sort: 'recent' });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await q({ pageSize: '2', page: '2', sort: 'recent' });
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.hasMore).toBe(false);
    // preferCrop raises matching crops within the same level
    expect((await q({ preferCrop: 'maize' })).body.items[0].cropId).toBe('maize');
  });
});

describe('privacy (enforced server-side)', () => {
  it('public responses contain no owner id, name, email, account data or coordinates', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const id = await publish(a, 8.31);
    const viewer = await newUser();
    const responses = [
      await request(app).get('/api/v1/community/experiences?countryCode=LK&admin1Code=LK-7&admin2Code=LK-71'),
      await request(app).get(`/api/v1/community/experiences/${id}`),
      await viewer.agent.get(`/api/v1/community/experiences/${id}`),
      await request(app).get(`/api/v1/community/experiences/${id}/related`),
      await request(app).get('/api/v1/community/locations'),
    ];
    for (const r of responses) {
      expect(r.status).toBe(200);
      const text = JSON.stringify(r.body);
      for (const secret of [a.id, a.email, a.name, 'ownerId', 'passwordHash', 'reporterId', 'moderatedBy', '8.31', '80.4', 'latitude', 'longitude']) {
        expect(text, `leaked ${secret}`).not.toContain(secret);
      }
    }
    const exp = responses[1].body.experience;
    expect(exp.verification).toBe('farmer_reported');
    expect(exp.postedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/); // date only
  });

  it('stores only the chosen location level — finer detail is not kept', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const r = await resolve(8.31);
    const res = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, { visibilityLevel: 'admin1' }));
    expect(res.status).toBe(201);
    const stored = await CommunityExperience.findById(res.body.experience.id).lean();
    expect(stored!.publicLocation).toMatchObject({ admin1Code: 'LK-7', admin2Code: null, admin2Name: null, visibilityLevel: 'admin1' });
    expect(JSON.stringify(stored)).not.toMatch(/80\.4|8\.31/);
  });

  it('rejects areas that were not resolved by the server (forged location)', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const r = await resolve(8.31);
    const forged = { ...r.area, admin2Name: 'Somewhere Else' };
    const res = await a.agent.post('/api/v1/community/experiences').set(H).send(body(forged, r.areaToken));
    expect(res.status).toBe(400);
  });

  it('asks for confirmation when text contains likely personal information', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const r = await resolve(8.31);
    const text = 'Call me on +94 77 123 4567 or email farmer@example.org to buy my mung bean seed harvest.';
    const res = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, { description: text }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PRIVACY_CHECK_REQUIRED');
    expect(JSON.stringify(res.body)).not.toContain('example.org'); // the error does not echo the private data
    const ok = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, { description: text, acknowledgePrivacyWarnings: true }));
    expect(ok.status).toBe(201);
    expect(detectPersonalInfo(text).map((w) => w.type).sort()).toEqual(['email', 'phone']);
  });

  it('owners cannot be identified through error messages, and others cannot read pending posts', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const r = await resolve(8.31);
    const created = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken));
    const id = created.body.experience.id;
    const other = await newUser();
    for (const res of [await request(app).get(`/api/v1/community/experiences/${id}`), await other.agent.patch(`/api/v1/community/experiences/${id}`).set(H).send({ title: 'x' }), await other.agent.delete(`/api/v1/community/experiences/${id}`).set(H)]) {
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain(a.id);
    }
  });
});

describe('posting, ownership and moderation', () => {
  it('guests cannot publish; required fields are validated; new posts wait for review', async ({ skip }) => {
    if (!available) skip();
    const r = await resolve(8.31);
    expect((await request(app).post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken))).status).toBe(401);
    const a = await newUser();
    const tooShort = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, { description: 'Too short' }));
    expect(tooShort.status).toBe(400);
    const extra = await a.agent.post('/api/v1/community/experiences').set(H).send({ ...body(r.area, r.areaToken), ownerId: a.id, moderationStatus: 'published', helpfulCount: 99 });
    expect(extra.status).toBe(400); // mass assignment rejected (strict schema)
    const ok = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken));
    expect(ok.body.experience.moderationStatus).toBe('pending');
    expect(ok.body.experience.helpfulCount).toBe(0);
    // pending posts are not public
    const feed = await request(app).get('/api/v1/community/experiences?countryCode=LK');
    expect(feed.body.items).toHaveLength(0);
    const mine = await a.agent.get('/api/v1/community/my-experiences');
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].moderationStatus).toBe('pending');
  });

  it('owners can edit (re-reviewed) and delete their own posts', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const id = await publish(a, 8.31);
    const edit = await a.agent.patch(`/api/v1/community/experiences/${id}`).set(H).send({ title: 'Mung bean after rice', visibilityLevel: 'country' });
    expect(edit.status).toBe(200);
    expect(edit.body.experience).toMatchObject({ title: 'Mung bean after rice', edited: true, moderationStatus: 'pending', publicLocation: { visibilityLevel: 'country', admin1Code: null, admin2Code: null } });
    // cannot make a location MORE specific without re-resolving it
    expect((await a.agent.patch(`/api/v1/community/experiences/${id}`).set(H).send({ visibilityLevel: 'admin2' })).status).toBe(400);
    expect((await a.agent.delete(`/api/v1/community/experiences/${id}`).set(H)).status).toBe(204);
    expect((await a.agent.get('/api/v1/community/my-experiences')).body.items).toHaveLength(0);
  });

  it('only moderators can moderate, and not their own posts', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const r = await resolve(8.31);
    const created = await a.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken));
    const id = created.body.experience.id;
    expect((await a.agent.get('/api/v1/community/moderation/queue')).status).toBe(403);
    expect((await a.agent.patch(`/api/v1/community/moderation/${id}`).set(H).send({ status: 'published' })).status).toBe(403);
    const mod = await newUser('moderator');
    const queue = await mod.agent.get('/api/v1/community/moderation/queue');
    expect(queue.body.items.map((i: any) => i.id)).toContain(id);
    expect(JSON.stringify(queue.body)).not.toContain(a.id);
    const modPost = await mod.agent.post('/api/v1/community/experiences').set(H).send(body(r.area, r.areaToken, { description: 'A moderator also farms and shares this rice experience here.' }));
    expect((await mod.agent.patch(`/api/v1/community/moderation/${modPost.body.experience.id}`).set(H).send({ status: 'published' })).status).toBe(403);
  });
});

describe('helpful reactions and reports', () => {
  it('one helpful per account, undo works, counts are server-side, owners cannot self-mark', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const id = await publish(a, 8.31);
    const b = await newUser();
    const c = await newUser();
    expect((await b.agent.post(`/api/v1/community/experiences/${id}/helpful`).set(H)).body).toEqual({ helpfulCount: 1, viewerMarkedHelpful: true });
    expect((await b.agent.post(`/api/v1/community/experiences/${id}/helpful`).set(H)).body.helpfulCount).toBe(1); // duplicate ignored
    expect((await c.agent.post(`/api/v1/community/experiences/${id}/helpful`).set(H)).body.helpfulCount).toBe(2);
    expect((await b.agent.get(`/api/v1/community/experiences/${id}`)).body.experience.viewerMarkedHelpful).toBe(true);
    expect((await b.agent.delete(`/api/v1/community/experiences/${id}/helpful`).set(H)).body).toEqual({ helpfulCount: 1, viewerMarkedHelpful: false });
    expect((await a.agent.post(`/api/v1/community/experiences/${id}/helpful`).set(H)).status).toBe(400);
    expect((await request(app).post(`/api/v1/community/experiences/${id}/helpful`).set(H)).status).toBe(401);
    expect(await CommunityReaction.countDocuments({ experienceId: id })).toBe(1);
  });

  it('reports are recorded once per account and enough reports hide a post for review', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const id = await publish(a, 8.31);
    const reporters = [await newUser(), await newUser(), await newUser()];
    expect((await reporters[0].agent.post(`/api/v1/community/experiences/${id}/report`).set(H).send({ reason: 'spam' })).status).toBe(201);
    expect((await reporters[0].agent.post(`/api/v1/community/experiences/${id}/report`).set(H).send({ reason: 'spam' })).status).toBe(409);
    await reporters[1].agent.post(`/api/v1/community/experiences/${id}/report`).set(H).send({ reason: 'misleading', details: 'Wrong season' });
    await reporters[2].agent.post(`/api/v1/community/experiences/${id}/report`).set(H).send({ reason: 'abusive' });
    expect((await request(app).get(`/api/v1/community/experiences/${id}`)).status).toBe(404); // hidden after 3 reports
    const mine = await a.agent.get('/api/v1/community/my-experiences');
    expect(mine.body.items[0]).toMatchObject({ moderationStatus: 'hidden', openReports: 3 });
    const mod = await newUser('moderator');
    const queue = await mod.agent.get('/api/v1/community/moderation/queue');
    const item = queue.body.items.find((i: any) => i.id === id);
    expect(item.reports).toHaveLength(3);
    expect(JSON.stringify(item)).not.toMatch(new RegExp(reporters.map((r) => r.id).join('|')));
    await mod.agent.patch(`/api/v1/community/moderation/${id}`).set(H).send({ status: 'published' });
    expect((await request(app).get(`/api/v1/community/experiences/${id}`)).status).toBe(200);
  });

  it('deleting an account removes its community content and reactions', async ({ skip }) => {
    if (!available) skip();
    const a = await newUser();
    const id = await publish(a, 8.31);
    const b = await newUser();
    const other = await publish(b, 8.31, { description: 'Another farmer shares a rice experience about Maha season water.' });
    await a.agent.post(`/api/v1/community/experiences/${other}/helpful`).set(H);
    expect((await a.agent.delete('/api/v1/auth/account').set(H).send({ password: 'a long test password' })).status).toBe(204);
    expect(await CommunityExperience.exists({ _id: id })).toBeNull();
    expect((await CommunityExperience.findById(other).lean())!.helpfulCount).toBe(0);
  });
});

describe('personal information detector', () => {
  it('flags emails, phones, URLs, coordinates and street addresses, but not normal farming text', () => {
    expect(detectPersonalInfo('Planted 25 kg of seed on 2 acres in 2023.')).toEqual([]);
    expect(detectPersonalInfo('Visit www.myfarm.lk').map((w) => w.type)).toContain('url');
    expect(detectPersonalInfo('My field is at 8.3114, 80.4037').map((w) => w.type)).toContain('coordinates');
    expect(detectPersonalInfo('I live at 12 Temple Road near the tank').map((w) => w.type)).toContain('address');
  });
});
