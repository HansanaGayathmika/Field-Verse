import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { seedReferenceData } from '../src/seeds/seed';

/**
 * MongoDB persistence & authorization tests using a real mongod from mongodb-memory-server.
 * Skipped (with a message) if the mongod binary cannot be downloaded/started in this environment.
 */
let mongo: MongoMemoryServer | null = null;
let available = false;
const app = createApp();
const H = { 'X-FieldVerse-Client': '1' };

beforeAll(async () => {
  try {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('fieldverse-test'));
    await seedReferenceData();
    available = true;
  } catch (err) {
    console.warn(`⚠ Skipping MongoDB tests: ${(err as Error).message}`);
  }
});

afterAll(async () => {
  await mongoose.disconnect().catch(() => undefined);
  await mongo?.stop().catch(() => undefined);
});

const fieldBody = {
  farmName: 'Test paddy',
  regionId: 'sri-lanka-anuradhapura',
  field: { latitude: 8.31, longitude: 80.4, currentCrop: 'rice', cropHistory: ['rice'], soilType: 'clay', soilPh: 6.1, irrigation: 'limited' },
  priorities: { water: 0.5, soilHealth: 0.5, risk: 0, income: 0 },
};

describe('MongoDB persistence', () => {
  it('serves reference data from the database once seeded', async ({ skip }) => {
    if (!available) skip();
    const r = await request(app).get('/api/v1/regions');
    expect(r.headers['x-data-origin']).toBe('database');
    expect(r.body.regions).toHaveLength(3);
    const crops = await request(app).get('/api/v1/crops');
    expect(crops.headers['x-data-origin']).toBe('database');
  });

  it('guest field CRUD with ownership isolation', async ({ skip }) => {
    if (!available) skip();
    const alice = request.agent(app);
    const bob = request.agent(app);

    const created = await alice.post('/api/v1/fields').set(H).send(fieldBody);
    expect(created.status).toBe(201);
    expect(created.headers['set-cookie']?.[0]).toMatch(/fv_sid=.*HttpOnly/i);
    const id = created.body.field.id;
    expect(created.body.field).toMatchObject({ ownerType: 'guest', farmName: 'Test paddy', field: { soilPh: 6.1 } });
    expect(created.body.field.expiresAt).toBeTruthy(); // guest data is temporary

    expect((await alice.get('/api/v1/fields')).body.fields).toHaveLength(1);
    expect((await alice.get(`/api/v1/fields/${id}`)).status).toBe(200);

    // Bob cannot see, change or delete Alice's private field.
    await bob.post('/api/v1/fields').set(H).send({ ...fieldBody, farmName: 'Bob farm' });
    expect((await bob.get('/api/v1/fields')).body.fields.map((f: { farmName: string }) => f.farmName)).toEqual(['Bob farm']);
    expect((await bob.get(`/api/v1/fields/${id}`)).status).toBe(404);
    expect((await bob.patch(`/api/v1/fields/${id}`).set(H).send({ farmName: 'hacked' })).status).toBe(404);
    expect((await bob.delete(`/api/v1/fields/${id}`).set(H)).status).toBe(404);
    // anonymous requests see nothing
    expect((await request(app).get('/api/v1/fields')).body.fields).toEqual([]);

    const patched = await alice.patch(`/api/v1/fields/${id}`).set(H).send({ farmName: 'Renamed', field: { irrigation: 'none' } });
    expect(patched.body.field).toMatchObject({ farmName: 'Renamed', field: { irrigation: 'none', currentCrop: 'rice' } });

    expect((await alice.delete(`/api/v1/fields/${id}`).set(H)).status).toBe(204);
    expect((await alice.get(`/api/v1/fields/${id}`)).status).toBe(404);
  });

  it('saves farms anywhere in the world with crops the farmer added', async ({ skip }) => {
    if (!available) skip();
    const a = request.agent(app);
    const r = await a
      .post('/api/v1/fields')
      .set(H)
      .send({ ...fieldBody, regionId: 'custom', field: { ...fieldBody.field, latitude: 7.95, longitude: -1.02, currentCrop: 'cassava', cropHistory: ['groundnut', 'maize'] } });
    expect(r.status).toBe(201);
    expect(r.body.field).toMatchObject({ regionId: 'custom', field: { currentCrop: 'cassava', cropHistory: ['groundnut', 'maize'], latitude: 7.95 } });
    // crop ids must still be valid slugs
    expect((await a.post('/api/v1/fields').set(H).send({ ...fieldBody, field: { ...fieldBody.field, currentCrop: 'Not A Slug!' } })).status).toBe(400);
  });

  it('validates field input and references', async ({ skip }) => {
    if (!available) skip();
    const a = request.agent(app);
    expect((await a.post('/api/v1/fields').set(H).send({ ...fieldBody, farmName: '' })).status).toBe(400);
    expect((await a.post('/api/v1/fields').set(H).send({ ...fieldBody, regionId: 'atlantis' })).body.error.code).toBe('REGION_NOT_SUPPORTED');
    expect((await a.get('/api/v1/fields/not-an-id')).status).toBe(404);
  });

  it('saves scenarios with provenance read from the analysis itself', async ({ skip }) => {
    if (!available) skip();
    const a = request.agent(app);
    const analysis = (
      await a.post('/api/v1/rotations/compare').set(H).send({ schemaVersion: '1.0', regionId: fieldBody.regionId, field: fieldBody.field, priorities: fieldBody.priorities })
    ).body;
    const saved = await a
      .post('/api/v1/scenarios')
      .set(H)
      .send({ title: 'My plan', regionId: fieldBody.regionId, farmerInputs: { field: fieldBody.field, priorities: fieldBody.priorities }, scenario: analysis.scenario, analysis });
    expect(saved.status).toBe(201);
    expect(saved.body.scenario).toMatchObject({ mode: 'demo', modelVersion: null, analysisRequestId: analysis.requestId });
    expect(saved.body.scenario.sourceIds).toContain('nasa-power-climatology');
    const list = await a.get('/api/v1/scenarios');
    expect(list.body.scenarios).toHaveLength(1);
    expect((await request(app).get(`/api/v1/scenarios/${saved.body.scenario.id}`)).status).toBe(404);
    expect((await a.delete(`/api/v1/scenarios/${saved.body.scenario.id}`).set(H)).status).toBe(204);
  });

  it('registration adopts guest data; login, logout and account deletion work', async ({ skip }) => {
    if (!available) skip();
    const a = request.agent(app);
    await a.post('/api/v1/fields').set(H).send(fieldBody);
    const reg = await a.post('/api/v1/auth/register').set(H).send({ name: 'Asha', email: 'asha@example.org', password: 'correct horse battery' });
    expect(reg.status).toBe(201);
    const fields = (await a.get('/api/v1/fields')).body.fields;
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ ownerType: 'user', expiresAt: null });

    expect((await a.post('/api/v1/auth/register').set(H).send({ name: 'X', email: 'asha@example.org', password: 'another password' })).status).toBe(409);
    expect((await a.get('/api/v1/auth/session')).body).toMatchObject({ authenticated: true, user: { email: 'asha@example.org' } });

    // password hash is never returned and is not plain text
    const user = await mongoose.connection.collection('users').findOne({ email: 'asha@example.org' });
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(reg.body)).not.toContain('scrypt');

    expect((await a.post('/api/v1/auth/logout').set(H)).status).toBe(204);
    expect((await a.get('/api/v1/auth/session')).body.authenticated).toBe(false);
    expect((await a.post('/api/v1/auth/login').set(H).send({ email: 'asha@example.org', password: 'wrong password!' })).status).toBe(401);
    expect((await a.post('/api/v1/auth/login').set(H).send({ email: 'asha@example.org', password: 'correct horse battery' })).status).toBe(200);
    expect((await a.get('/api/v1/fields')).body.fields).toHaveLength(1);

    expect((await a.delete('/api/v1/auth/account').set(H).send({ password: 'nope' })).status).toBe(401);
    expect((await a.delete('/api/v1/auth/account').set(H).send({ password: 'correct horse battery' })).status).toBe(204);
    expect(await mongoose.connection.collection('fields').countDocuments({ ownerKey: `user:${user!._id}` })).toBe(0);
  });

  it('applies TTL indexes only to temporary data', async ({ skip }) => {
    if (!available) skip();
    const fieldIdx = await mongoose.connection.collection('fields').indexes();
    const ttl = fieldIdx.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.partialFilterExpression).toEqual({ ownerType: 'guest' });
    const userIdx = await mongoose.connection.collection('users').indexes();
    expect(userIdx.some((i) => i.expireAfterSeconds !== undefined)).toBe(false);
  });
});
