/**
 * TDD coverage for the GetCurrentUser use case.
 *
 * Verifies successful profile retrieval for registered users and
 * UserNotFoundError for non-existing user IDs.
 */
import { GetCurrentUser } from '../../src/useCases/GetCurrentUser';
import { RegisterUser } from '../../src/useCases/RegisterUser';
import { LoginUser } from '../../src/useCases/LoginUser';
import { describe, expect, it } from '@jest/globals';
import {
  FakeUserRepository,
  FakeSessionRepository,
  FakePasswordHasher,
  FakeTokenSigner,
  FakeClock,
  FakeIdGenerator,
} from '../helpers/fakes';
import { SessionRevokedError, UserNotFoundError } from '../../src/domain/entities/errors';
import { UserRole } from '../../src/domain/entities/UserRole';

function makeUseCases() {
  const userRepo = new FakeUserRepository();
  const sessionRepo = new FakeSessionRepository();
  const hasher = new FakePasswordHasher();
  const signer = new FakeTokenSigner();
  const clock = new FakeClock();
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
    8 * 60 * 60 * 1000,
  );
  const getMe = new GetCurrentUser(userRepo, sessionRepo, clock);

  return { register, login, getMe, sessionRepo, clock };
}

describe('GetCurrentUser', () => {
  it('returns user profile for a registered user', async () => {
    const { register, login, getMe } = makeUseCases();

    const { user } = await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'alice@e.com',
      password: 'Password123!',
    });

    const loginResult = await login.execute({ identifier: 'alice', password: 'Password123!' });

    const profile = await getMe.execute({
      userId: user.id,
      sessionId: loginResult.session.tokenId,
    });

    expect(profile.username).toBe('alice');
    expect(profile.name).toBe('Alice');
    expect(profile.surname).toBe('Rossi');
    expect(profile.email).toBe('alice@e.com');
    expect(profile.role).toBe(UserRole.BASE);
    expect(profile.id).toBe(user.id);
  });

  it('throws SessionRevokedError when session does not exist', async () => {
    const { register, getMe } = makeUseCases();

    const { user } = await register.execute({
      username: 'bob',
      name: 'Bob',
      surname: 'Verdi',
      email: 'bob@e.com',
      password: 'Password123!',
    });

    await expect(getMe.execute({ userId: user.id, sessionId: 'missing-session' })).rejects.toThrow(
      SessionRevokedError,
    );
  });

  it('throws UserNotFoundError when user does not exist with valid session', async () => {
    const { getMe, sessionRepo, clock } = makeUseCases();

    await sessionRepo.save({
      id: 'ses_ghost',
      userId: 'usr_ghost',
      tokenId: 'tok_ghost',
      loggedIn: clock.now(),
      expiresAt: new Date(clock.now().getTime() + 60_000),
      loggedOut: null,
      isRevoked: false,
    });

    await expect(
      getMe.execute({ userId: 'usr_ghost', sessionId: 'tok_ghost' }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
