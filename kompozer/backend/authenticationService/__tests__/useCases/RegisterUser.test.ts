/**
 * TDD coverage for the RegisterUser use case.
 *
 * Verifies successful registration (BASE role, hashed password),
 * duplicate username/email errors, validation errors, and assigned ID uniqueness.
 */
import { RegisterUser } from '../../src/useCases/RegisterUser';
import { describe, expect, it } from '@jest/globals';
import {
  FakeUserRepository,
  FakePasswordHasher,
  FakeClock,
  FakeIdGenerator,
} from '../helpers/fakes';
import {
  DuplicateUsernameError,
  DuplicateEmailError,
  ValidationError,
} from '../../src/domain/entities/errors';
import { UserRole } from '../../src/domain/entities/UserRole';

function makeUseCase() {
  const userRepo = new FakeUserRepository();
  const hasher = new FakePasswordHasher();
  const clock = new FakeClock();
  const idGen = new FakeIdGenerator('usr');
  const useCase = new RegisterUser(userRepo, hasher, clock, idGen);
  return { useCase, userRepo, hasher };
}

describe('RegisterUser', () => {
  it('creates a new user with role BASE and hashed password', async () => {
    const { useCase, userRepo } = makeUseCase();

    const result = await useCase.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    expect(result.user.username).toBe('valerio');
    expect(result.user.name).toBe('Valerio');
    expect(result.user.surname).toBe('Rossi');
    expect(result.user.email).toBe('valerio@example.com');
    expect(result.user.role).toBe(UserRole.BASE);
    expect(result.user.id).toBeDefined();

    const saved = await userRepo.findByUsername('valerio');
    expect(saved).not.toBeNull();
    expect(saved!.passwordHash).toBe('hashed:Password123!');
    expect(saved!.passwordHash).not.toBe('Password123!');
  });

  it('throws DuplicateUsernameError when username is already taken', async () => {
    const { useCase } = makeUseCase();

    await useCase.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'first@example.com',
      password: 'Password123!',
    });

    await expect(
      useCase.execute({
        username: 'valerio',
        name: 'Valerio',
        surname: 'Rossi',
        email: 'second@example.com',
        password: 'Password123!',
      }),
    ).rejects.toThrow(DuplicateUsernameError);
  });

  it('throws DuplicateEmailError when email is already registered', async () => {
    const { useCase } = makeUseCase();

    await useCase.execute({
      username: 'first',
      name: 'First',
      surname: 'User',
      email: 'shared@example.com',
      password: 'Password123!',
    });

    await expect(
      useCase.execute({
        username: 'second',
        name: 'Second',
        surname: 'User',
        email: 'shared@example.com',
        password: 'Password123!',
      }),
    ).rejects.toThrow(DuplicateEmailError);
  });

  it('throws ValidationError when username is empty', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({
        username: '',
        name: 'Test',
        surname: 'User',
        email: 'a@b.com',
        password: 'Password123!',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when email is invalid', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({
        username: 'user',
        name: 'Test',
        surname: 'User',
        email: 'not-an-email',
        password: 'Password123!',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when password is shorter than 8 characters', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({
        username: 'user',
        name: 'Test',
        surname: 'User',
        email: 'a@b.com',
        password: 'short',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('assigns a unique id to each user', async () => {
    const { useCase } = makeUseCase();

    const r1 = await useCase.execute({
      username: 'user1',
      name: 'User',
      surname: 'One',
      email: 'u1@example.com',
      password: 'Password123!',
    });
    const r2 = await useCase.execute({
      username: 'user2',
      name: 'User',
      surname: 'Two',
      email: 'u2@example.com',
      password: 'Password123!',
    });

    expect(r1.user.id).not.toBe(r2.user.id);
  });
});
