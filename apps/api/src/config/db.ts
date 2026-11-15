import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export type DbStatus = 'connected' | 'connecting' | 'disconnected' | 'not_configured';

let lastError: string | null = null;

export function dbStatus(): { status: DbStatus; message: string | null } {
  if (!env.MONGODB_URI) return { status: 'not_configured', message: 'MONGODB_URI is not set' };
  switch (mongoose.connection.readyState) {
    case 1:
      return { status: 'connected', message: null };
    case 2:
      return { status: 'connecting', message: null };
    default:
      return { status: 'disconnected', message: lastError };
  }
}

export const isDbReady = () => mongoose.connection.readyState === 1;

/**
 * Connects to MongoDB without crashing the server when it is unavailable:
 * the fixture-based public demo keeps working, and we keep retrying in the background.
 */
export async function connectDb(uri = env.MONGODB_URI): Promise<boolean> {
  if (!uri) {
    logger.warn('MONGODB_URI not set — running without database (demo analysis still available).');
    return false;
  }
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
    lastError = null;
    logger.info('MongoDB connected', { db: mongoose.connection.name });
    return true;
  } catch (err) {
    lastError = (err as Error).message;
    logger.warn('MongoDB unavailable — will retry in 15s. Saving features are disabled meanwhile.', { error: lastError });
    if (env.NODE_ENV !== 'test') {
      setTimeout(() => void connectDb(uri), 15000).unref();
    }
    return false;
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
