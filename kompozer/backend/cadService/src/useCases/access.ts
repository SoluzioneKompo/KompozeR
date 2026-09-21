import { Configuration } from '../domain/entities/Configuration';

/** Returns true when actor can access configuration as owner or collaborator. */
export function canAccessConfiguration(configuration: Configuration, actorId: string): boolean {
  return configuration.ownerId === actorId || configuration.collaborators.includes(actorId);
}

/** Returns true when actor role grants read access to any configuration (e.g. admin order printing). */
export function isAdminRole(actorRole?: string): boolean {
  return typeof actorRole === 'string' && actorRole.toUpperCase() === 'ADMIN';
}
