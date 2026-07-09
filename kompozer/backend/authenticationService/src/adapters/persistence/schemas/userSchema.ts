/**
 * Mongoose schema for the `users` collection.
 *
 * Defines the MongoDB document shape for users.
 * Uses _id: String (UUID) instead of default ObjectId for domain consistency.
 * createdAt and updatedAt are managed automatically via timestamps.
 */
import { Schema, model } from 'mongoose';
import { UserRole } from '../../../domain/entities/UserRole';

type UserDocType = {
  _id: string;
  username: string;
  name: string;
  surname: string;
  passwordHash: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDocType>(
  {
    _id: { type: String, required: true },
    username: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    surname: { type: String, required: true },
    passwordHash: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, _id: false },
);

export const UserModel = model<UserDocType>('User', userSchema, 'users');
