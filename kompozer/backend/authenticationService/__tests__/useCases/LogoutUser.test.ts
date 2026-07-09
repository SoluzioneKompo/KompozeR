/**
 * TDD coverage for the LogoutUser use case.
 *
 * Verifies successful logout (loggedOut set), SessionNotFoundError for
 * missing sessions, and ForbiddenError for cross-user logout attempts.
 */
import { LogoutUser } from '../../src/useCases/LogoutUser';
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
import { SessionNotFoundError, ForbiddenError } from '../../src/domain/entities/errors';

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
  const logout = new LogoutUser(sessionRepo, clock);

  return { register, login, logout, sessionRepo };
}

describe('LogoutUser', () => {
  it('marks the session as logged out', async () => {
    const { register, login, logout, sessionRepo } = makeUseCases();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'v@example.com',
      password: 'Password123!',
    });
    const loginResult = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    await logout.execute({
      userId: loginResult.user.id,
      sessionId: loginResult.session.id,
    });

    const session = await sessionRepo.findById(loginResult.session.id);
    expect(session!.loggedOut).not.toBeNull();
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    const { register, login, logout } = makeUseCases();

    await register.execute({
      username: 'valerio',
      name: 'Valerio',
      surname: 'Rossi',
      email: 'v@example.com',
      password: 'Password123!',
    });
    const loginResult = await login.execute({ identifier: 'valerio', password: 'Password123!' });

    await expect(
      logout.execute({ userId: loginResult.user.id, sessionId: 'non-existent' }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('throws ForbiddenError when userId does not match session owner', async () => {
    const { register, login, logout } = makeUseCases();

    await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'alice@e.com',
      password: 'Password123!',
    });
    await register.execute({
      username: 'bob',
      name: 'Bob',
      surname: 'Verdi',
      email: 'bob@e.com',
      password: 'Password123!',
    });

    const aliceLogin = await login.execute({ identifier: 'alice', password: 'Password123!' });
    const bobLogin = await login.execute({ identifier: 'bob', password: 'Password123!' });

    await expect(
      logout.execute({ userId: bobLogin.user.id, sessionId: aliceLogin.session.id }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('marks session logged out when called with tokenId (gateway header semantics)', async () => {
    const { register, login, logout, sessionRepo } = makeUseCases();

    await register.execute({
      username: 'gateway-user',
      name: 'Gateway',
      surname: 'User',
      email: 'gateway@example.com',
      password: 'Password123!',
    });
    const loginResult = await login.execute({
      identifier: 'gateway-user',
      password: 'Password123!',
    });

    // Simulates gateway-injected X-Session-Id: tokenId, not session.id.
    await logout.execute({
      userId: loginResult.user.id,
      sessionId: loginResult.session.tokenId,
    });

    const session = await sessionRepo.findById(loginResult.session.id);
    expect(session!.loggedOut).not.toBeNull();
  });
});
