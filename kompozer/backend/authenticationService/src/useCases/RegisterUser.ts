/**
 * Use case for registering a new user.
 *
 * Validates input (username, email, password), ensures no username/email
 * duplicates exist, hashes the password, and persists the user with BASE role.
 */
import { UserRepository } from '../domain/ports/UserRepository';
import { PasswordHasher } from '../domain/ports/PasswordHasher';
import { Clock } from '../domain/ports/Clock';
import { IdGenerator } from '../domain/ports/IdGenerator';
import { UserRole } from '../domain/entities/UserRole';
import {
  DuplicateUsernameError,
  DuplicateEmailError,
  ValidationError,
} from '../domain/entities/errors';
import { RegisterUserInput, RegisterUserOutput } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;

export class RegisterUser {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly idGen: IdGenerator,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    this.validate(input);

    const [existingByUsername, existingByEmail] = await Promise.all([
      this.userRepo.findByUsername(input.username),
      this.userRepo.findByEmail(input.email),
    ]);

    if (existingByUsername) throw new DuplicateUsernameError(input.username);
    if (existingByEmail) throw new DuplicateEmailError(input.email);

    const now = this.clock.now();
    const user = {
      id: this.idGen.generate(),
      username: input.username,
      name: input.name.trim(),
      surname: input.surname.trim(),
      email: input.email,
      passwordHash: await this.hasher.hash(input.password),
      role: UserRole.BASE,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.userRepo.save(user);

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        surname: user.surname,
        email: user.email,
        role: user.role,
      },
    };
  }

  private validate(input: RegisterUserInput): void {
    const errors: { field: string; reason: string }[] = [];

    if (!input.username || input.username.trim() === '') {
      errors.push({ field: 'username', reason: 'Username is required' });
    }

    if (!input.name || input.name.trim() === '') {
      errors.push({ field: 'name', reason: 'Name is required' });
    } else if (input.name.trim().length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', reason: `Name must be at most ${MAX_NAME_LENGTH} characters` });
    }

    if (!input.surname || input.surname.trim() === '') {
      errors.push({ field: 'surname', reason: 'Surname is required' });
    } else if (input.surname.trim().length > MAX_NAME_LENGTH) {
      errors.push({ field: 'surname', reason: `Surname must be at most ${MAX_NAME_LENGTH} characters` });
    }

    if (!input.email || !EMAIL_RE.test(input.email)) {
      errors.push({ field: 'email', reason: 'Valid email is required' });
    }

    if (!input.password || input.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({
        field: 'password',
        reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    if (errors.length > 0) {
      throw new ValidationError('Validation failed', errors);
    }
  }
}
