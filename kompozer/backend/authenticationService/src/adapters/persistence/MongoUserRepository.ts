/**
 * MongoDB implementation of UserRepository.
 *
 * Uses Mongoose for CRUD operations on the `users` collection.
 * The toEntity() mapper isolates domain code from Mongo/Mongoose document
 * structure (no Mongoose types leaking into the domain layer).
 */
import { User } from '../../domain/entities/User';
import { UserRole } from '../../domain/entities/UserRole';
import { UserRepository } from '../../domain/ports/UserRepository';
import { UserModel } from './schemas/userSchema';

export class MongoUserRepository implements UserRepository {
  async save(user: User): Promise<void> {
    await UserModel.create({
      _id: user.id,
      username: user.username,
      name: user.name,
      surname: user.surname,
      passwordHash: user.passwordHash,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const doc = await UserModel.findById(id).lean();
    return doc ? this.toEntity(doc) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const doc = await UserModel.findOne({ username }).lean();
    return doc ? this.toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email }).lean();
    return doc ? this.toEntity(doc) : null;
  }

  async update(user: User): Promise<void> {
    await UserModel.findByIdAndUpdate(user.id, {
      username: user.username,
      name: user.name,
      surname: user.surname,
      passwordHash: user.passwordHash,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    });
  }

  private toEntity(doc: {
    _id: string;
    username: string;
    name: string;
    surname: string;
    passwordHash: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: doc._id,
      username: doc.username,
      name: doc.name,
      surname: doc.surname,
      passwordHash: doc.passwordHash,
      email: doc.email,
      role: doc.role as UserRole,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
