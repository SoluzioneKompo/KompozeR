/**
 * Global setup executed once before the e2e suite.
 * 1) Waits for gateway and dependent services readiness.
 * 2) Runs idempotent admin seed for tests requiring ADMIN privileges.
 *
 * Prerequisite: docker compose -f docker-compose.dev.yml up
 */

const http         = require('http');
const { execSync } = require('child_process');
const path         = require('path');
const fs           = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Checks if API gateway is reachable and responsive.
 * @returns {Promise<boolean>} True when the gateway responds without server errors.
 */
function checkGateway() {
  return new Promise(resolve => {
    http
      // Il gateway risponde 200 se tutti i servizi sono up, 207 se alcuni sono down.
      // In dev con soli 3 servizi implementati, 207 è atteso e sufficiente.
      .get('http://localhost:3000/health', res => resolve(res.statusCode < 500))
      .on('error', () => resolve(false));
  });
}

/**
 * Performs an HTTP request against the gateway and returns parsed payload metadata.
 * @param {string} pathname Relative gateway path.
 * @param {string} [method='GET'] HTTP method.
 * @param {Record<string, string>} [headers={}] Request headers.
 * @param {string|null} [body=null] Optional request body.
 * @returns {Promise<{status:number, body:unknown, raw:string}>} Parsed response information.
 */
function requestGateway(pathname, method = 'GET', headers = {}, body = null) {
  return new Promise(resolve => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: pathname,
        method,
        headers,
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch {
            parsed = null;
          }
          resolve({ status: res.statusCode || 0, body: parsed, raw: data });
        });
      },
    );

    req.on('error', () => resolve({ status: 0, body: null, raw: '' }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ status: 0, body: null, raw: '' });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Waits for the provided milliseconds.
 * @param {number} ms Delay in milliseconds.
 * @returns {Promise<void>} Promise resolved after the delay.
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Resolves the npm executable command across platforms.
 * @returns {string} Shell-ready npm command string.
 */
function resolveNpmCommand() {
  if (process.platform !== 'win32') {
    return 'npm';
  }

  const candidates = [
    process.env.npm_execpath,
    'C:/Program Files/nodejs/npm.cmd',
    'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = candidate.replace(/\\/g, '/');
    if (fs.existsSync(normalized)) {
      if (normalized.endsWith('npm-cli.js')) {
        return `"${process.execPath}" "${normalized}"`;
      }
      return `"${normalized}"`;
    }
  }

  return 'npm.cmd';
}

/**
 * Prepends current Node.js runtime directory to PATH variables.
 * @param {NodeJS.ProcessEnv} env Base environment object.
 * @returns {NodeJS.ProcessEnv} Environment with PATH and Path updated.
 */
function withNodeInPath(env) {
  const nodeDir = path.dirname(process.execPath);
  const currentPath = env.PATH || env.Path || '';
  const joined = currentPath ? `${nodeDir};${currentPath}` : nodeDir;
  return {
    ...env,
    PATH: joined,
    Path: joined,
  };
}

/**
 * Derives setup prerequisites from selected test targets.
 * @returns {{needsAuth:boolean,needsCatalog:boolean,needsCad:boolean,needsReporting:boolean,needsAdminSeed:boolean}} Required setup flags.
 */
function detectTargetNeeds() {
  const rawArgs = [process.argv.join(' '), process.env.npm_config_argv || '']
    .join(' ')
    .toLowerCase();

  const wants = {
    auth: rawArgs.includes('auth.integration.test'),
    catalog: rawArgs.includes('catalog.integration.test'),
    cad: rawArgs.includes('cad.integration.test'),
    cart: rawArgs.includes('cart.integration.test'),
    reporting: rawArgs.includes('reporting.integration.test'),
    order: rawArgs.includes('order.integration.test'),
    notifications: rawArgs.includes('notifications.integration.test'),
  };

  const hasKnownTarget = Object.values(wants).some(Boolean);
  if (!hasKnownTarget) {
    return {
      needsAuth: true,
      needsCatalog: true,
      needsCad: true,
      needsReporting: true,
      needsAdminSeed: true,
    };
  }

  const needsCatalog =
    wants.catalog || wants.cad || wants.cart || wants.reporting || wants.order;
  const needsCad = wants.cad;
  const needsReporting = wants.reporting;
  const needsAuth =
    wants.auth || needsCatalog || wants.notifications;
  const needsAdminSeed =
    wants.catalog || wants.cart || wants.reporting || wants.order;

  return {
    needsAuth,
    needsCatalog,
    needsCad,
    needsReporting,
    needsAdminSeed,
  };
}

// ── globalSetup ──────────────────────────────────────────────────────────────

/**
 * Orchestrates service readiness checks and optional admin seeding before tests.
 * @returns {Promise<void>} Resolves when environment is ready or throws on critical failures.
 */
module.exports = async function globalSetup() {
  const targets = detectTargetNeeds();

  // ── 1. Attendi il gateway (max 30 s) ─────────────────────────────────────
  const timeoutMs = 30000;
  const start     = Date.now();
  let up          = false;

  process.stdout.write('\n[e2e] Verifica gateway su localhost:3000');
  while (Date.now() - start < timeoutMs) {
    up = await checkGateway();
    if (up) break;
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write(up ? ' OK\n' : ' FAIL\n');

  if (!up) {
    throw new Error(
      '\n[e2e] Gateway non raggiungibile su localhost:3000.\n' +
      'Assicurati che i container siano in esecuzione:\n' +
      '  cd kompozer && docker compose -f docker-compose.dev.yml up\n',
    );
  }

  // ── 1b. Attendi auth via endpoint pubblico reale: POST /auth/guest ─────
  let guestToken = '';
  if (targets.needsAuth) {
    process.stdout.write('[e2e] Attendo auth (POST /auth/guest)');
    while (Date.now() - start < timeoutMs) {
      const res = await requestGateway('/auth/guest', 'POST', {
        'Content-Type': 'application/json',
      });
      if (res.status === 200 && res.body && typeof res.body.token === 'string') {
        guestToken = res.body.token;
        break;
      }
      process.stdout.write('.');
      await sleep(1000);
    }
    process.stdout.write(guestToken ? ' OK\n' : ' FAIL\n');

    if (!guestToken) {
      throw new Error(
        '\n[e2e] auth non pronto entro timeout (POST /auth/guest non riuscito).\n',
      );
    }
  } else {
    process.stdout.write('[e2e] Skip auth readiness (non richiesto dai test selezionati)\n');
  }

  // ── 1c. Attendi catalog via endpoint reale protetto: GET /catalog ───────
  if (targets.needsCatalog) {
    process.stdout.write('[e2e] Attendo catalog (GET /catalog con token guest)');
    let catalogReady = false;
    while (Date.now() - start < timeoutMs) {
      const res = await requestGateway('/catalog', 'GET', {
        Authorization: `Bearer ${guestToken}`,
      });
      if (res.status === 200) {
        catalogReady = true;
        break;
      }
      process.stdout.write('.');
      await sleep(1000);
    }
    process.stdout.write(catalogReady ? ' OK\n' : ' FAIL\n');

    if (!catalogReady) {
      throw new Error(
        '\n[e2e] catalog non pronto entro timeout (GET /catalog non riuscito).\n',
      );
    }
  } else {
    process.stdout.write('[e2e] Skip catalog readiness (non richiesto dai test selezionati)\n');
  }

  // ── 1d. Attendi CAD service via healthcheck ──────────────────────────────
  if (targets.needsCad) {
    process.stdout.write('[e2e] Attendo cad-service (GET /cad/health)');
    let cadReady = false;
    while (Date.now() - start < timeoutMs) {
      const res = await requestGateway('/cad/health', 'GET', {
        Authorization: `Bearer ${guestToken}`,
      });
      if (res.status === 200 || res.status === 401 || res.status === 403) {
        cadReady = true;
        break;
      }
      process.stdout.write('.');
      await sleep(1000);
    }
    process.stdout.write(cadReady ? ' OK\n' : ' WARN (cad test potrebbero fallire)\n');
  } else {
    process.stdout.write('[e2e] Skip cad readiness (non richiesto dai test selezionati)\n');
  }

  // ── 1e. Attendi reporting service via healthcheck ────────────────────────
  if (targets.needsReporting) {
    process.stdout.write('[e2e] Attendo reporting-service (GET /reports/health)');
    let reportingReady = false;
    while (Date.now() - start < timeoutMs) {
      const res = await requestGateway('/reports/health', 'GET', {
        Authorization: `Bearer ${guestToken}`,
      });
      if (res.status === 200 || res.status === 401 || res.status === 403) {
        reportingReady = true;
        break;
      }
      process.stdout.write('.');
      await sleep(1000);
    }
    process.stdout.write(reportingReady ? ' OK\n' : ' WARN (reporting test potrebbero fallire)\n');
  } else {
    process.stdout.write('[e2e] Skip reporting readiness (non richiesto dai test selezionati)\n');
  }

  // ── 2. Seed admin idempotente ─────────────────────────────────────────────
  // Crea/aggiorna devuser (ADMIN) in authdb usando lo script seed del servizio.
  // Il seed legge DEVUSER.json e fa upsert — rieseguibile senza effetti collaterali.
  const authServiceDir = path.resolve(
    __dirname, '..', 'backend', 'authenticationService',
  );

  if (targets.needsAdminSeed) {
    process.stdout.write('[e2e] Seed admin (devuser in authdb)...');
    try {
      const npmCmd = resolveNpmCommand();
      execSync(`${npmCmd} run seed`, {
        cwd:   authServiceDir,
        shell: true,
        env: withNodeInPath({
          ...process.env,
          MONGO_URI:   'mongodb://root:changeme@localhost:27017/authdb?authSource=admin',
          JWT_SECRET:  'kompozer-dev-secret-key-32-chars!!',
        }),
        stdio: 'pipe',
      });
      process.stdout.write(' OK\n');
    } catch (err) {
      process.stdout.write(' WARN\n');
      const msg = err.stderr ? err.stderr.toString().trim() : String(err.message);
      process.stderr.write(
        `[e2e] Seed fallito — i test ADMIN potrebbero fallire.\n  ${msg}\n`,
      );
    }
  } else {
    process.stdout.write('[e2e] Skip admin seed (non richiesto dai test selezionati)\n');
  }
};
