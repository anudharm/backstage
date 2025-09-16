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

import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { mcpCatalogPlugin } from './plugin';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { stringifyEntityRef } from '@backstage/catalog-model';

describe('mcpCatalogPlugin', () => {
  const entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'order-service',
      namespace: 'default',
      title: 'Order Service',
      description: 'Handles order lifecycle workflows.',
      tags: ['service', 'orders'],
    },
    spec: {
      type: 'service',
      owner: 'team-a',
      lifecycle: 'production',
    },
  };

  async function setup() {
    const { server } = await startTestBackend({
      features: [
        mcpCatalogPlugin,
        catalogServiceMock.factory({
          entities: [entity],
        }),
        mockServices.rootLogger.factory({ level: 'error' }),
      ],
    });

    const client = new Client({
      name: 'test client',
      version: '1.0',
    });

    const address = server.address();
    if (!address || typeof address !== 'object' || !('port' in address)) {
      throw new Error('test server did not expose a port');
    }

    const baseUrl = new URL(`http://localhost:${address.port}/api/mcp-catalog/v1`);
    const transport = new StreamableHTTPClientTransport(baseUrl);

    await client.connect(transport);

    return { client, server };
  }

  it('should expose the catalog search tool', async () => {
    const { client, server } = await setup();

    const result = await client.request(
      {
        method: 'tools/list',
      },
      ListToolsResultSchema,
    );

    await client.close();
    await server.stop();

    expect(result.tools).toEqual([
      expect.objectContaining({
        name: 'catalog.search',
        annotations: expect.objectContaining({ title: 'Catalog Search' }),
      }),
    ]);
  });

  it('should return formatted catalog results when the tool is invoked', async () => {
    const { client, server } = await setup();

    const response = await client.request(
      {
        method: 'tools/call',
        params: { name: 'catalog.search', arguments: { query: 'order' } },
      },
      CallToolResultSchema,
    );

    await client.close();
    await server.stop();

    const textContent = response.content
      ?.filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    expect(textContent).toContain('Order Service');
    expect(textContent).toContain(stringifyEntityRef(entity));
  });
});
