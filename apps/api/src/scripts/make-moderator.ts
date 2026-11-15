/**
 * Grants (or removes) the community moderator role for an existing account.
 *   npm run make-moderator -w @fieldverse/api -- someone@example.org
 *   npm run make-moderator -w @fieldverse/api -- someone@example.org --remove
 */
import { connectDb, disconnectDb } from '../config/db';
import { User } from '../models/User';

const email = process.argv[2]?.trim().toLowerCase();
const remove = process.argv.includes('--remove');
if (!email || !email.includes('@')) {
  console.error('Usage: npm run make-moderator -w @fieldverse/api -- <email> [--remove]');
  process.exit(1);
}
if (!(await connectDb())) {
  console.error('MongoDB is not reachable. Start it first (npm run db:memory).');
  process.exit(1);
}
const user = await User.findOneAndUpdate({ email }, { $set: { role: remove ? 'farmer' : 'moderator' } }, { new: true });
console.log(user ? `✓ ${email} is now: ${user.role}` : `No account found for ${email}. The person must sign up first.`);
await disconnectDb();
process.exit(user ? 0 : 1);
