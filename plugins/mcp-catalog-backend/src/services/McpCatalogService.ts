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

import {
  BackstageCredentials,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { CatalogService } from '@backstage/plugin-catalog-node';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NotFoundError } from '@backstage/errors';
import { z } from 'zod';
import { handleErrors } from './handleErrors';
import { version } from '@backstage/plugin-mcp-catalog-backend/package.json';

const SEARCH_TOOL_NAME = 'catalog.search';

const searchInputJsonSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  additionalProperties: false,
  properties: {
    query: {
      type: 'string',
      description: 'Text used to search the catalog.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      description: 'Maximum number of results to return (defaults to 5).',
    },
    filterKinds: {
      type: 'array',
      description: 'Optional list of entity kinds to filter by (e.g. Component, API).',
      items: { type: 'string' },
    },
    fields: {
      type: 'array',
      description: 'Optional list of dot-delimited entity fields to include.',
      items: { type: 'string' },
    },
  },
  required: ['query'],
};

const searchArgsSchema = z.object({
  query: z.string().min(1, 'query must not be empty'),
  limit: z.number().int().positive().max(20).optional(),
  filterKinds: z
    .array(z.string().min(1))
    .max(10, 'filterKinds must contain 10 kinds or fewer')
    .optional(),
  fields: z.array(z.string().min(1)).optional(),
});

type SearchArgs = z.infer<typeof searchArgsSchema>;

type Options = {
  catalog: CatalogService;
  logger: LoggerService;
};

export class McpCatalogService {
  private readonly catalog: CatalogService;
  private readonly logger: LoggerService;

  private constructor(options: Options) {
    this.catalog = options.catalog;
    this.logger = options.logger.child({ plugin: 'mcp-catalog' });
  }

  static async create(options: Options) {
    return new McpCatalogService(options);
  }

  getServer({ credentials }: { credentials: BackstageCredentials }) {
    const server = new McpServer(
      {
        name: 'backstage-catalog',
        version,
      },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: SEARCH_TOOL_NAME,
          description:
            'Search Backstage catalog entities with optional kind and field filters.',
          inputSchema: searchInputJsonSchema,
          annotations: {
            title: 'Catalog Search',
            destructiveHint: false,
            idempotentHint: true,
            readOnlyHint: true,
            openWorldHint: false,
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async ({ params }) =>
      handleErrors(async () => {
        if (params.name !== SEARCH_TOOL_NAME) {
          throw new NotFoundError(`Tool "${params.name}" not found`);
        }

        const input = searchArgsSchema.parse(params.arguments ?? {});
        const request = this.createQueryRequest(input);

        this.logger.debug('Executing catalog search', {
          query: input.query,
          limit: request.limit,
          filter: request.filter,
        });

        const response = await this.catalog.queryEntities(request, {
          credentials,
        });

        const text = this.formatSearchResults(
          input,
          response.items,
          response.totalItems,
        );

        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      }),
    );

    return server;
  }

  private createQueryRequest(input: SearchArgs) {
    return {
      limit: input.limit ?? 5,
      fields: input.fields,
      filter: input.filterKinds?.length
        ? [{ kind: input.filterKinds.map(kind => kind.toLocaleLowerCase('en-US')) }]
        : undefined,
      fullTextFilter: {
        term: input.query,
      },
    };
  }

  private formatSearchResults(
    input: SearchArgs,
    entities: Entity[],
    total: number,
  ) {
    if (!entities.length) {
      return `No catalog entities found for "${input.query}".`;
    }

    const header =
      total > entities.length
        ? `Showing ${entities.length} of ${total} matches for "${input.query}".\n\n`
        : `Results for "${input.query}":\n\n`;

    const entityDescriptions = entities.map((entity, index) => {
      const title = entity.metadata.title ?? entity.metadata.name;
      const description =
        entity.metadata.description ?? '_No description available._';
      const owner = this.getStringFromSpec(entity, 'owner');
      const lifecycle = this.getStringFromSpec(entity, 'lifecycle');
      const tags = Array.isArray(entity.metadata.tags)
        ? entity.metadata.tags
        : [];

      const details = [
        `ref: ${stringifyEntityRef(entity)}`,
        owner ? `owner: ${owner}` : undefined,
        lifecycle ? `lifecycle: ${lifecycle}` : undefined,
        tags.length ? `tags: ${tags.join(', ')}` : undefined,
      ].filter((value): value is string => Boolean(value));

      const metadataLines = details.map(detail => `  - ${detail}`).join('\n');

      return [
        `${index + 1}. **${title}** (${entity.kind})`,
        description,
        metadataLines,
      ]
        .filter(Boolean)
        .join('\n');
    });

    return `${header}${entityDescriptions.join('\n\n')}`;
  }

  private getStringFromSpec(entity: Entity, key: string) {
    if (!entity.spec || typeof entity.spec !== 'object') {
      return undefined;
    }

    const value = (entity.spec as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
}
