/**
 * Use case for authenticating an existing user.
 *
 * Verifies credentials, creates a DB session, and signs a JWT with userId,
 * tokenId, and role. Returns token plus session and user summaries.
 */
import { UserRepository } from '../domain/ports/UserRepository';
import { SessionRepository } from '../domain/ports/SessionRepository';
import { PasswordHasher } from '../domain/ports/PasswordHasher';
import { TokenSigner } from '../domain/ports/TokenSigner';
import { Clock } from '../domain/ports/Clock';
import { IdGenerator } from '../domain/ports/IdGenerator';
import { InvalidCredentialsError, InvalidPasswordError } from '../domain/entities/errors';
import { LoginUserInput, LoginUserOutput } from './types';

export class LoginUser {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly sessionRepo: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly signer: TokenSigner,
    private readonly clock: Clock,
    private readonly sessionIdGen: IdGenerator,
    private readonly tokenIdGen: IdGenerator,
    private readonly sessionTtlMs: number,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    const identifier = input.identifier.trim();
    const user =
      (await this.userRepo.findByUsername(identifier)) ??
      (await this.userRepo.findByEmail(identifier));

    // Do not expose whether the identifier exists.
    if (!user) throw new InvalidCredentialsError();

    const passwordValid = await this.hasher.compare(input.password, user.passwordHash);
    if (!passwordValid) throw new InvalidPasswordError();

    const now = this.clock.now();
    const sessionId = this.sessionIdGen.generate();
    const tokenId = this.tokenIdGen.generate();
    const expiresAt = new Date(now.getTime() + this.sessionTtlMs);

    const session = {
      id: sessionId,
      userId: user.id,
      tokenId,
      loggedIn: now,
      expiresAt,
      loggedOut: null,
      isRevoked: false,
    };

    await this.sessionRepo.save(session);

    const token = this.signer.sign(
      { userId: user.id, tokenId, role: user.role },
      this.sessionTtlMs / 1000,
    );

    return {
      token,
      session: {
        id: session.id,
        tokenId: session.tokenId,
        loggedIn: session.loggedIn,
        expiresAt: session.expiresAt,
      },
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }
}
