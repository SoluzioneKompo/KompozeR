/**
 * Use case for retrieving the authenticated user's profile.
 *
 * Receives userId injected by API Gateway (X-User-Id header)
 * and returns complete profile data excluding password hash.
 */
import { Clock } from '../domain/ports/Clock';
import { SessionRepository } from '../domain/ports/SessionRepository';
import { UserRepository } from '../domain/ports/UserRepository';
import { SessionRevokedError, UserNotFoundError } from '../domain/entities/errors';
import { GetCurrentUserInput, GetCurrentUserOutput } from './types';

export class GetCurrentUser {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetCurrentUserInput): Promise<GetCurrentUserOutput> {
    // Gateway forwards tokenId in X-Session-Id; fallback by id for compatibility.
    let session = await this.sessionRepo.findByTokenId(input.sessionId);
    if (!session) {
      session = await this.sessionRepo.findById(input.sessionId);
    }

    const now = this.clock.now();
    const isInactive =
      !session ||
      session.userId !== input.userId ||
      session.isRevoked ||
      session.loggedOut !== null ||
      session.expiresAt.getTime() <= now.getTime();

    if (isInactive) throw new SessionRevokedError();

    const user = await this.userRepo.findById(input.userId);

    if (!user) throw new UserNotFoundError();

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      surname: user.surname,
      email: user.email,
      role: user.role,
    };
  }
}
