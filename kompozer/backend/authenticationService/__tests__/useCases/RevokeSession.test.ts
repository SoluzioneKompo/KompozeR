/**
 * TDD coverage for RevokeSession and ListUserSessions use cases.
 *
 * RevokeSession: successful revocation (isRevoked=true), SessionNotFoundError,
 * ADMIN revocation of third-party sessions, and ForbiddenError for BASE users
 * revoking other users' sessions.
 *
 * ListUserSessions: complete session listing and empty result for users with
 * no sessions.
 */
import { RevokeSession } from '../../src/useCases/RevokeSession';
import { ListUserSessions } from '../../src/useCases/ListUserSessions';
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
import { UserRole } from '../../src/domain/entities/UserRole';
import { User } from '../../src/domain/entities/User';

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
  const revoke = new RevokeSession(sessionRepo, userRepo);
  const listSessions = new ListUserSessions(sessionRepo);

  return { register, login, revoke, listSessions, userRepo, sessionRepo };
}

describe('RevokeSession', () => {
  it('marks the session as revoked', async () => {
    const { register, login, revoke, sessionRepo } = makeUseCases();

    await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'a@e.com',
      password: 'Password123!',
    });
    const loginResult = await login.execute({ identifier: 'alice', password: 'Password123!' });

    await revoke.execute({
      requestingUserId: loginResult.user.id,
      sessionId: loginResult.session.id,
    });

    const session = await sessionRepo.findById(loginResult.session.id);
    expect(session!.isRevoked).toBe(true);
  });

  it('throws SessionNotFoundError when session does not exist', async () => {
    const { register, revoke } = makeUseCases();

    await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'a@e.com',
      password: 'Password123!',
    });

    await expect(
      revoke.execute({ requestingUserId: 'usr_001', sessionId: 'non-existent' }),
    ).rejects.toThrow(SessionNotFoundError);
  });

  it('admin can revoke any session', async () => {
    const { register, login, revoke, userRepo, sessionRepo } = makeUseCases();

    await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'a@e.com',
      password: 'Password123!',
    });
    const aliceLogin = await login.execute({ identifier: 'alice', password: 'Password123!' });

    // Manually promote an admin user
    const admin: User = {
      id: 'admin_001',
      username: 'admin',
      name: 'Admin',
      surname: 'Root',
      passwordHash: 'hashed:admin',
      email: 'admin@e.com',
      role: UserRole.ADMIN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await userRepo.save(admin);

    await expect(
      revoke.execute({ requestingUserId: 'admin_001', sessionId: aliceLogin.session.id }),
    ).resolves.not.toThrow();

    const session = await sessionRepo.findById(aliceLogin.session.id);
    expect(session!.isRevoked).toBe(true);
  });

  it('throws ForbiddenError when a BASE user tries to revoke another user session', async () => {
    const { register, login, revoke } = makeUseCases();

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
      revoke.execute({
        requestingUserId: bobLogin.user.id,
        sessionId: aliceLogin.session.id,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('ListUserSessions', () => {
  it('returns all sessions for a user', async () => {
    const { register, login, listSessions } = makeUseCases();

    await register.execute({
      username: 'alice',
      name: 'Alice',
      surname: 'Rossi',
      email: 'a@e.com',
      password: 'Password123!',
    });
    const r1 = await login.execute({ identifier: 'alice', password: 'Password123!' });
    const r2 = await login.execute({ identifier: 'alice', password: 'Password123!' });

    const { sessions } = await listSessions.execute({ userId: r1.user.id });

    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => s.id);
    expect(ids).toContain(r1.session.id);
    expect(ids).toContain(r2.session.id);
  });

  it('returns an empty list when the user has no sessions', async () => {
    const { listSessions } = makeUseCases();

    const { sessions } = await listSessions.execute({ userId: 'no-such-user' });
    expect(sessions).toHaveLength(0);
  });
});
