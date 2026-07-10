import { Configuration } from '../domain/entities/Configuration';

/** Returns true when actor can access configuration as owner or collaborator. */
export function canAccessConfiguration(configuration: Configuration, actorId: string): boolean {
  return configuration.ownerId === actorId || configuration.collaborators.includes(actorId);
}
