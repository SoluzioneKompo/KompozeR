/**
 * Use case that transforms a catalog event into user notifications.
 * Applies idempotency via processed-event repository.
 */
import { CatalogEvent } from '../domain/entities/CatalogEvent';
import { Notification } from '../domain/entities/Notification';
import { NotificationBroadcaster } from '../domain/ports/NotificationBroadcaster';
import { ImpactResolver } from '../domain/ports/ImpactResolver';
import { NotificationRepository } from '../domain/ports/NotificationRepository';
import { ProcessedEventRepository } from '../domain/ports/ProcessedEventRepository';
import { logger } from '../infrastructure/logger';

export interface IdGenerator {
  generate(): string;
}

function toMessage(event: CatalogEvent): { title: string; message: string } {
  if (event.type === 'PRICE_CHANGED') {
    return {
      title: 'Prezzo aggiornato',
      message: `Il componente ${event.sku} ha cambiato prezzo: ${event.oldPrice} -> ${event.newPrice}`,
    };
  }

  return {
    title: 'Disponibilita aggiornata',
    message: event.newIsAvailable
      ? `Il componente ${event.sku} e nuovamente disponibile`
      : `Il componente ${event.sku} non e piu disponibile`,
  };
}

export class HandleCatalogEvent {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly processedEvents: ProcessedEventRepository,
    private readonly impactResolver: ImpactResolver,
    private readonly broadcaster: NotificationBroadcaster,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(event: CatalogEvent): Promise<number> {
    const alreadyProcessed = await this.processedEvents.hasProcessed(event.eventId);
    if (alreadyProcessed) {
      return 0;
    }

    const impacts = await this.impactResolver.resolve(event);
    if (impacts.length === 0) {
      await this.processedEvents.markProcessed(event.eventId, new Date());
      return 0;
    }

    const rendered = toMessage(event);
    const notifications: Notification[] = impacts.map((impact) => ({
      id: this.idGenerator.generate(),
      userId: impact.userId,
      type: event.type,
      title: rendered.title,
      message: rendered.message,
      sku: event.sku,
      componentId: event.componentId,
      contextType: impact.contextType,
      contextId: impact.contextId,
      read: false,
      createdAt: new Date(),
      readAt: null,
    }));

    await this.repo.saveMany(notifications);

    await Promise.allSettled(notifications.map((n) => this.broadcaster.push(n)));

    await this.processedEvents.markProcessed(event.eventId, new Date());

    // Not HTTP request-scoped (triggered off the Redis catalog-events subscriber),
    // so there's no req.log to attach a traceId to — use the base logger.
    logger.info(
      {
        event: 'notification.sent',
        catalogEventId: event.eventId,
        catalogEventType: event.type,
        sku: event.sku,
        count: notifications.length,
      },
      'Notifications created and pushed for catalog event',
    );

    return notifications.length;
  }
}
