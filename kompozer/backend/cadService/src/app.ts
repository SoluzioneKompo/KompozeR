import cors from 'cors';
import express from 'express';
import { Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger, redactUrl } from './infrastructure/logger';
import { buildCadRouter } from './adapters/http/cadRouter';
import { HttpCatalogRulesProvider } from './adapters/http/HttpCatalogRulesProvider';
import { HttpCartServiceClient } from './adapters/http/HttpCartServiceClient';
import { HttpNotificationSubscriptionClient } from './adapters/http/HttpNotificationSubscriptionClient';
import { errorMiddleware } from './adapters/http/errorMiddleware';
import { MongoConfigurationRepository } from './adapters/persistence/MongoConfigurationRepository';
import { CatalogRulesProvider } from './domain/ports/CatalogRulesProvider';
import { CartServiceClient } from './domain/ports/CartServiceClient';
import { NotificationSubscriptionClient } from './domain/ports/NotificationSubscriptionClient';
import { ConfigurationRepository } from './domain/ports/ConfigurationRepository';
import { InMemoryCollabSessionService } from './domain/services/InMemoryCollabSessionService';
import { GetConfiguration } from './useCases/read/GetConfiguration';
import { ListConfigurations } from './useCases/read/ListConfigurations';
import { ListNextOptions } from './useCases/read/ListNextOptions';
import { CreateConfiguration } from './useCases/write/CreateConfiguration';
import { FinalizeConfiguration } from './useCases/write/FinalizeConfiguration';
import { ReorderConfiguration } from './useCases/write/ReorderConfiguration';
import { SetCategory } from './useCases/write/SetCategory';
import { SetColumnPlan } from './useCases/write/SetColumnPlan';
import { SetEnvironment } from './useCases/write/SetEnvironment';
import { UpdateDesign } from './useCases/write/UpdateDesign';

/**
 * Optional dependency overrides used to build the CAD HTTP application.
 *
 * Tests provide fakes through this object, while production relies on
 * the default Mongo/HTTP implementations created inside buildApp.
 */
export interface BuildAppDeps {
  configurationRepository?: ConfigurationRepository;
  catalogRulesProvider?: CatalogRulesProvider;
  cartServiceClient?: CartServiceClient;
  notificationSubscriptionClient?: NotificationSubscriptionClient;
  collabSessionService?: InMemoryCollabSessionService;
}

/**
 * Composes and configures the CAD service Express application.
 */
export function buildApp(deps: BuildAppDeps = {}) {
  const configurationRepository = deps.configurationRepository ?? new MongoConfigurationRepository();
  const catalogRulesProvider = deps.catalogRulesProvider
    ?? new HttpCatalogRulesProvider(process.env['CATALOG_BASE_URL'] || 'http://localhost:3004');
  const cartServiceClient = deps.cartServiceClient
    ?? new HttpCartServiceClient(process.env['CART_BASE_URL'] || 'http://localhost:3003');
  const notificationBaseUrl = process.env['NOTIFICATION_BASE_URL'];
  const notificationSubscriptionClient = deps.notificationSubscriptionClient
    ?? (notificationBaseUrl
      ? new HttpNotificationSubscriptionClient(notificationBaseUrl)
      : undefined);
  const collabSessionService = deps.collabSessionService
    ?? new InMemoryCollabSessionService(configurationRepository);

  const createConfiguration = new CreateConfiguration(configurationRepository);
  const listConfigurations = new ListConfigurations(configurationRepository);
  const getConfiguration = new GetConfiguration(configurationRepository, catalogRulesProvider);
  const listNextOptions = new ListNextOptions(configurationRepository, catalogRulesProvider);
  const setEnvironment = new SetEnvironment(configurationRepository);
  const setCategory = new SetCategory(configurationRepository);
  const setColumnPlan = new SetColumnPlan(configurationRepository, catalogRulesProvider);
  const updateDesign = new UpdateDesign(configurationRepository, catalogRulesProvider);
  const finalizeConfiguration = new FinalizeConfiguration(
    configurationRepository,
    cartServiceClient,
    notificationSubscriptionClient,
  );
  const reorderConfiguration = new ReorderConfiguration(configurationRepository, cartServiceClient);

  const app = express();

  app.use(cors());
  app.use(
    pinoHttp({
      logger,
      // IMPORTANT: this service sits BEHIND the api-gateway, which already mints
      // a trace id and forwards it as the x-trace-id header. Reuse it — do NOT
      // mint a new one — so one request can be followed end-to-end across
      // services in Grafana/Loki. Only api-gateway (the system's edge) mints.
      genReqId: (req, res) => {
        const incoming = req.headers['x-trace-id'];
        const traceId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
        res.setHeader('x-trace-id', traceId);
        return traceId;
      },
      customProps: (req) => ({ traceId: req.id }),
      // Both this service's own health checks (root and under /cad) are
      // liveness/readiness noise, not business traffic worth a log line.
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/cad/health' },
      serializers: {
        req: (req) => ({ method: req.method, url: redactUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/cad',
    buildCadRouter({
      createConfiguration,
      listConfigurations,
      getConfiguration,
      listNextOptions,
      setEnvironment,
      setCategory,
      setColumnPlan,
      updateDesign,
      finalizeConfiguration,
      reorderConfiguration,
      collabSessionService,
    }),
  );

  app.use(errorMiddleware);

  return app;
}
