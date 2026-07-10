import {
  Configuration,
  validateConfigurationModel,
} from '../../domain/entities/Configuration';
import { ResourceConflictError } from '../../domain/entities/errors';
import { ConfigurationRepository } from '../../domain/ports/ConfigurationRepository';
import {
  ConfigurationDoc,
  ConfigurationModel,
} from './schemas/configurationSchema';

/** MongoDB repository implementation for CAD configurations. */
export class MongoConfigurationRepository implements ConfigurationRepository {
  async save(configuration: Configuration): Promise<void> {
    validateConfigurationModel(configuration);

    await ConfigurationModel.create(this.toDoc(configuration));
  }

  async findById(id: string): Promise<Configuration | null> {
    const doc = await ConfigurationModel.findById(id).lean();
    return doc ? this.toEntity(doc) : null;
  }

  async findByOwner(ownerId: string): Promise<Configuration[]> {
    const docs = await ConfigurationModel.find({ ownerId }).sort({ updatedAt: -1 }).lean();
    return docs.map((doc) => this.toEntity(doc));
  }

  async findAccessibleByUser(userId: string): Promise<Configuration[]> {
    const docs = await ConfigurationModel.find({
      $or: [
        { ownerId: userId },
        { collaborators: userId },
      ],
    }).sort({ updatedAt: -1 }).lean();
    return docs.map((doc) => this.toEntity(doc));
  }

  async addCollaborator(id: string, userId: string): Promise<void> {
    await ConfigurationModel.updateOne(
      { _id: id, ownerId: { $ne: userId } },
      { $addToSet: { collaborators: userId } },
    );
  }

  async update(configuration: Configuration): Promise<void> {
    validateConfigurationModel(configuration);

    const result = await ConfigurationModel.findOneAndUpdate(
      { _id: configuration.id, version: configuration.version - 1 },
      {
        ownerId: configuration.ownerId,
        collaborators: configuration.collaborators,
        name: configuration.name,
        status: configuration.status,
        category: configuration.category,
        environment: configuration.environment,
        columnPlan: configuration.columnPlan,
        columnDesigns: configuration.columnDesigns,
        components: configuration.components,
        version: configuration.version,
        updatedAt: configuration.updatedAt,
      },
      { new: true },
    ).lean();

    if (!result) {
      throw new ResourceConflictError('Configuration version conflict');
    }
  }

  /** Maps a persistence document into domain aggregate shape. */
  private toEntity(doc: ConfigurationDoc): Configuration {
    return {
      id: doc._id,
      ownerId: doc.ownerId,
      collaborators: doc.collaborators ?? [],
      name: doc.name,
      status: doc.status,
      category: doc.category ?? null,
      environment: doc.environment ?? null,
      columnPlan: doc.columnPlan ?? null,
      columnDesigns: doc.columnDesigns ?? [],
      components: doc.components ?? [],
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** Maps a domain aggregate into the MongoDB document shape. */
  private toDoc(configuration: Configuration): ConfigurationDoc {
    return {
      _id: configuration.id,
      ownerId: configuration.ownerId,
      collaborators: configuration.collaborators,
      name: configuration.name,
      status: configuration.status,
      category: configuration.category,
      environment: configuration.environment,
      columnPlan: configuration.columnPlan,
      columnDesigns: configuration.columnDesigns,
      components: configuration.components,
      version: configuration.version,
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
    };
  }
}
