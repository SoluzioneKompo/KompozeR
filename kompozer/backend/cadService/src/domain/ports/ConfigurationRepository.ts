import { Configuration } from '../entities/Configuration';

/** Persistence contract for CAD configurations. */
export interface ConfigurationRepository {
  save(configuration: Configuration): Promise<void>;
  findById(id: string): Promise<Configuration | null>;
  findByOwner(ownerId: string): Promise<Configuration[]>;
  findAccessibleByUser(userId: string): Promise<Configuration[]>;
  addCollaborator(id: string, userId: string): Promise<void>;
  update(configuration: Configuration): Promise<void>;
}
