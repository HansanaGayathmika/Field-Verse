import type { Request, Response } from 'express';
import { z } from 'zod';
import { LoginInputSchema, RegisterInputSchema, type SessionInfo, type UserPublic } from '@fieldverse/contracts';
import { User } from '../models/User';
import { Field } from '../models/Field';
import { SavedScenario } from '../models/SavedScenario';
import { Session } from '../models/Session';
import { hashPassword, verifyPassword } from '../services/password';
import { createSession, destroySession } from '../middleware/session';
import { AppError } from '../utils/errors';
import { deleteUserCommunityData } from '../services/community';

function toPublic(u: any): UserPublic {
  return { id: String(u._id), name: u.name, email: u.email, role: u.role, language: u.language, createdAt: new Date(u.createdAt).toISOString() };
}

/** Move a guest's temporary demo records to the user account (and make them permanent). */
async function adoptGuestData(guestId: string, userId: string) {
  const from = `guest:${guestId}`;
  const to = `user:${userId}`;
  const update = { $set: { ownerKey: to, ownerType: 'user' }, $unset: { expiresAt: 1 } };
  await Field.updateMany({ ownerKey: from }, update);
  await SavedScenario.updateMany({ ownerKey: from }, update);
}

// A fixed dummy hash keeps login timing similar for unknown emails.
let dummyHash: Promise<string> | null = null;

export async function session(req: Request, res: Response) {
  let user: UserPublic | null = null;
  if (req.identity?.userId) {
    const u = await User.findById(req.identity.userId).lean();
    if (u) user = toPublic(u);
  }
  const body: SessionInfo = { authenticated: !!user, user, guest: !!req.identity && !user };
  res.setHeader('Cache-Control', 'no-store');
  res.json(body);
}

export async function register(req: Request, res: Response) {
  const input = RegisterInputSchema.parse(req.body);
  if (await User.exists({ email: input.email })) {
    throw new AppError(409, 'CONFLICT', 'An account with this email already exists. Try logging in.');
  }
  const user = await User.create({ name: input.name, email: input.email, passwordHash: await hashPassword(input.password), language: input.language });
  const guestId = req.identity?.guestId;
  if (guestId && !req.identity?.userId) await adoptGuestData(guestId, String(user._id));
  await destroySession(req, res);
  await createSession(res, { userId: String(user._id), guestId });
  res.status(201).json({ user: toPublic(user) });
}

export async function login(req: Request, res: Response) {
  const input = LoginInputSchema.parse(req.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  dummyHash ??= hashPassword('timing-equaliser-not-a-password');
  const ok = user ? await verifyPassword(input.password, user.passwordHash) : (await verifyPassword(input.password, await dummyHash), false);
  if (!user || !ok) throw new AppError(401, 'UNAUTHORIZED', 'Email or password is incorrect.');
  const guestId = req.identity?.guestId;
  if (guestId && !req.identity?.userId) await adoptGuestData(guestId, String(user._id));
  await destroySession(req, res); // rotate session id on login
  await createSession(res, { userId: String(user._id), guestId });
  res.json({ user: toPublic(user) });
}

export async function logout(req: Request, res: Response) {
  await destroySession(req, res);
  res.status(204).end();
}

const AccountUpdateSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), language: z.string().max(10).optional() }).refine((v) => v.name || v.language, 'Nothing to update');

export async function updateAccount(req: Request, res: Response) {
  const patch = AccountUpdateSchema.parse(req.body);
  const user = await User.findByIdAndUpdate(req.identity!.userId, { $set: patch }, { new: true }).lean();
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in again.');
  res.json({ user: toPublic(user) });
}

/** Permanently deletes the account and all data it owns. */
export async function deleteAccount(req: Request, res: Response) {
  const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body);
  const user = await User.findById(req.identity!.userId).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new AppError(401, 'UNAUTHORIZED', 'Password is incorrect.');
  const ownerKey = `user:${user._id}`;
  await Promise.all([Field.deleteMany({ ownerKey }), SavedScenario.deleteMany({ ownerKey }), Session.deleteMany({ userId: user._id })]);
  await deleteUserCommunityData(user._id);
  await user.deleteOne();
  await destroySession(req, res);
  res.status(204).end();
}
