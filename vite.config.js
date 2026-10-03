import { defineConfig, loadEnv } from 'vite';
import healthHandler from './api/health.js';
import loginHandler from './api/auth/login.js';
import registerHandler from './api/auth/register.js';
import saveHandler from './api/progress/save.js';
import loadHandler from './api/progress/load.js';

function createApiMiddleware() {
  return async (req, res, next) => {
    const host = (req.headers && req.headers.host) ? req.headers.host : 'localhost';
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/api/health') return healthHandler(req, res);
    if (url.pathname === '/api/auth/login') return loginHandler(req, res);
    if (url.pathname === '/api/auth/register') return registerHandler(req, res);
    if (url.pathname === '/api/progress/save') return saveHandler(req, res);
    if (url.pathname === '/api/progress/load') return loadHandler(req, res);
    next();
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL;
  if (env.POSTGRES_URL) process.env.POSTGRES_URL = env.POSTGRES_URL;

  const apiMiddleware = createApiMiddleware();

  return {
    build: {
      outDir: 'dist'
    },
    plugins: [
      {
        name: 'neon-api-server',
        configureServer(server) {
          server.middlewares.use(apiMiddleware);
        },
        configurePreviewServer(server) {
          server.middlewares.use(apiMiddleware);
        }
      }
    ]
  };
});
