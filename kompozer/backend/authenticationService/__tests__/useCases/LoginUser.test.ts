/**
 * TDD coverage for the LoginUser use case.
 *
 * Verifies valid-credential login output (token/session/profile), expiresAt
 * calculation, wrong-password and missing-user failures, session persistence,
 * and tokenId uniqueness across logins.
 */
import { LoginUser } from '../../src/useCases/LoginUser';
import { RegisterUser } from '../../src/useCases/RegisterUser';
import { describe, expect, it } from '@jest/globals';
import {
  FakeUserRepository,
  FakeSessionRepository,
  FakePasswordHasher,
  FakeTokenSigner,
  FakeClock,
  FakeIdGenerator,
} from '../helpers/fakes';
import { InvalidCredentialsError, InvalidPasswordError } from '../../src/domain/entities/errors';
import { UserRole } from '../../src/domain/entities/UserRole';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function makeUseCase() {
  const userRepo = new FakeUserRepository();
  const sessionRepo = new FakeSessionRepository();
  const hasher = new FakePasswordHasher();
  const signer = new FakeTokenSigner();
  const clock = new FakeClock(new Date('2026-05-30T10:00:00Z'));
  const userIdGen = new FakeIdGenerator('usr');
  const sessionIdGen = new FakeIdGenerator('ses');
  const tokenIdGen = new FakeIdGenerator('tok');

  const register = new RegisterUser(userRepo, hasher, clock, userIdGen);
  const login = new LoginUser(
    userRepo,
    sessionRepo,
    hasher,
    signer,
    clock,
    sessionIdGen,
    tokenIdGen,
    SESSION_TTL_MS,
  );

  return { register, login, userRepo, sessionRepo, clock };
}

describe('LoginUser', () => {
  it('returns a token, session and user summary on valid credentials', async () => {
    const { register, login } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    const result = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    expect(result.token).toBeDefined();
    expect(result.user.username).toBe('valerio');
    expect(result.user.role).toBe(UserRole.BASE);
    expect(result.session.id).toBeDefined();
    expect(result.session.tokenId).toBeDefined();
  });

  it('sets expiresAt to 8 hours after loggedIn', async () => {
    const { register, login, clock } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    const result = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    const expectedExpiry = new Date(clock.now().getTime() + SESSION_TTL_MS);
    expect(result.session.expiresAt).toEqual(expectedExpiry);
  });

  it('throws InvalidPasswordError when password is wrong', async () => {
    const { register, login } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    await expect(
      login.execute({ identifier: 'valerio', password: 'WrongPassword!' }),
    ).rejects.toThrow(InvalidPasswordError);
  });

  it('throws InvalidCredentialsError when user does not exist', async () => {
    const { login } = makeUseCase();

    await expect(
      login.execute({ identifier: 'ghost', password: 'Password123!' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('persists the session in the repository', async () => {
    const { register, login, sessionRepo } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });
    const result = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    const saved = await sessionRepo.findById(result.session.id);
    expect(saved).not.toBeNull();
    expect(saved!.loggedOut).toBeNull();
    expect(saved!.isRevoked).toBe(false);
  });

  it('creates a different tokenId for each login', async () => {
    const { register, login } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    const r1 = await login.execute({ identifier: 'valerio', password: 'Password123!' });
    const r2 = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    expect(r1.session.tokenId).not.toBe(r2.session.tokenId);
  });

  it('accepts email as login identifier', async () => {
    const { register, login } = makeUseCase();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'valerio@example.com',
      password: 'Password123!',
    });

    const result = await login.execute({
      identifier: 'valerio@example.com',
      password: 'Password123!',
    });

    expect(result.user.username).toBe('valerio');
  });
});
