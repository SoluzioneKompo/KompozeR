/**
 * Database seed script.
 *
 * Reads DEVUSER.json from the project root, hashes the password,
 * and performs an ADMIN user upsert in MongoDB.
 *
 * The script is idempotent: running it multiple times does not create duplicates.
 * If the user already exists, password hash, email, and role are updated to match
 * the configuration file.
 *
 * Usage: npm run seed
 * Prerequisites: MONGO_URI and JWT_SECRET must be set (or development defaults are used).
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { UserModel } from './adapters/persistence/schemas/userSchema';
import { UserRole } from './domain/entities/UserRole';

const SALT_ROUNDS = 12;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/kompozer-auth';
const DEVUSER_PATH = path.resolve(__dirname, '..', 'DEVUSER.json');

interface DevUserConfig {
  username: string;
  name: string;
  surname: string;
  password: string;
  email: string;
  role: string;
}

function readDevUserConfig(): DevUserConfig {
  const raw = fs.readFileSync(DEVUSER_PATH, 'utf-8');
  // Remove // comments (not valid in standard JSON) before parsing.
  const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(stripped) as DevUserConfig;
}

function resolveRole(role: string): UserRole {
  if (Object.values(UserRole).includes(role as UserRole)) {
    return role as UserRole;
  }
  console.warn(`[seed] Ruolo sconosciuto "${role}", fallback a BASE`);
  return UserRole.BASE;
}

async function seed(): Promise<void> {
  console.log(`[seed] Connessione a MongoDB: ${MONGO_URI}`);
  await mongoose.connect(MONGO_URI);

  const config = readDevUserConfig();
  const role = resolveRole(config.role);
  const passwordHash = await bcrypt.hash(config.password, SALT_ROUNDS);
  const now = new Date();

  const existing = await UserModel.findOne({ username: config.username }).lean();

  if (existing) {
    await UserModel.findByIdAndUpdate(existing._id, {
      name: config.name,
      surname: config.surname,
      passwordHash,
      email: config.email,
      role,
      updatedAt: now,
    });
    console.log(`[seed] Utente "${config.username}" aggiornato (upsert).`);
  } else {
    await UserModel.create({
      _id: uuidv4(),
      username: config.username,
      name: config.name,
      surname: config.surname,
      passwordHash,
      email: config.email,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`[seed] Utente "${config.username}" creato con ruolo ${role}.`);
  }

  await mongoose.disconnect();
  console.log('[seed] Completato.');
}

seed().catch((err: unknown) => {
  console.error('[seed] Errore:', err);
  process.exit(1);
});
