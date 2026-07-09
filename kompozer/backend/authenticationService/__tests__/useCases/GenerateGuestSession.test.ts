/**
 * TDD coverage for the GenerateGuestSession use case.
 *
 * Verifies GUEST token generation, guestId uniqueness, expiresAt calculation,
 * session persistence with isRevoked=false and loggedOut=null,
 * and guest_ username prefix in the response.
 */
import { GenerateGuestSession } from '../../src/useCases/GenerateGuestSession';
import { describe, expect, it } from '@jest/globals';
import {
  FakeSessionRepository,
  FakeTokenSigner,
  FakeClock,
  FakeIdGenerator,
} from '../helpers/fakes';
import { UserRole } from '../../src/domain/entities/UserRole';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function makeUseCase() {
  const sessionRepo = new FakeSessionRepository();
  const signer = new FakeTokenSigner();
  const clock = new FakeClock(new Date('2026-05-30T10:00:00Z'));
  const guestIdGen = new FakeIdGenerator('gst');
  const sessionIdGen = new FakeIdGenerator('ses');
  const tokenIdGen = new FakeIdGenerator('tok');

  const useCase = new GenerateGuestSession(
    sessionRepo,
    signer,
    clock,
    guestIdGen,
    sessionIdGen,
    tokenIdGen,
    SESSION_TTL_MS,
  );

  return { useCase, sessionRepo, clock };
}

describe('GenerateGuestSession', () => {
  it('returns a token, session, and a user with role GUEST', async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute();

    expect(result.token).toBeDefined();
    expect(result.user.role).toBe(UserRole.GUEST);
    expect(result.session.id).toBeDefined();
    expect(result.session.tokenId).toBeDefined();
  });

  it('generates a unique guest userId each time', async () => {
    const { useCase } = makeUseCase();
    const r1 = await useCase.execute();
    const r2 = await useCase.execute();

    expect(r1.user.id).not.toBe(r2.user.id);
  });

  it('sets expiresAt to 8 hours after loggedIn', async () => {
    const { useCase, clock } = makeUseCase();
    const result = await useCase.execute();

    const expectedExpiry = new Date(clock.now().getTime() + SESSION_TTL_MS);
    expect(result.session.expiresAt).toEqual(expectedExpiry);
  });

  it('persists the session with isRevoked false and loggedOut null', async () => {
    const { useCase, sessionRepo } = makeUseCase();
    const result = await useCase.execute();

    const saved = await sessionRepo.findById(result.session.id);
    expect(saved).not.toBeNull();
    expect(saved!.isRevoked).toBe(false);
    expect(saved!.loggedOut).toBeNull();
  });

  it('uses a username prefixed with guest_ in the user summary', async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute();

    expect(result.user.username).toMatch(/^guest_/);
  });
});
