/*
 * Copyright 2025 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import PromiseRouter from 'express-promise-router';
import { Router } from 'express';
import { McpCatalogService } from '../services/McpCatalogService';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { isError } from '@backstage/errors';

export const createStreamableRouter = ({
  mcpService,
  httpAuth,
  logger,
}: {
  mcpService: McpCatalogService;
  logger: LoggerService;
  httpAuth: HttpAuthService;
}): Router => {
  const router = PromiseRouter();

  router.post('/', async (req, res) => {
    try {
      const server = mcpService.getServer({
        credentials: await httpAuth.credentials(req),
      });

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      if (isError(error)) {
        logger.error(error.message);
      }

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  router.get('/', async (_, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      }),
    );
  });

  router.delete('/', async (_, res) => {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      }),
    );
  });

  return router;
};
