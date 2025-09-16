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
  createApiRef,
  DiscoveryApi,
  FetchApi,
  IdentityApi,
} from '@backstage/core-plugin-api';

export interface ChatbotResponse {
  text: string;
  raw: unknown;
}

export interface ChatbotApi {
  sendMessage(options: { message: string; limit?: number }): Promise<ChatbotResponse>;
}

export const chatbotApiRef = createApiRef<ChatbotApi>({
  id: 'plugin.chatbot.service',
  description: 'Provides access to the Backstage MCP catalog chatbot service.',
});

type Deps = {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  identityApi: IdentityApi;
};

export class McpCatalogChatbotApi implements ChatbotApi {
  constructor(private readonly deps: Deps) {}

  async sendMessage({ message, limit }: { message: string; limit?: number }) {
    const baseUrl = await this.deps.discoveryApi.getBaseUrl('mcp-catalog');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    try {
      const credentials = await this.deps.identityApi.getCredentials();
      if (credentials?.token) {
        headers.Authorization = `Bearer ${credentials.token}`;
      }
    } catch (error) {
      // Allow unauthenticated usage when credentials cannot be resolved.
    }

    const payload = {
      jsonrpc: '2.0',
      id: `catalog-search-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: 'catalog.search',
        arguments: {
          query: message,
          ...(limit ? { limit } : {}),
        },
      },
    };

    const response = await this.deps.fetchApi.fetch(`${baseUrl}/v1`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`MCP request failed with status ${response.status}`);
    }

    const data = await response.json();

    if (data?.error) {
      const errorMessage =
        data.error.message ?? data.error.data ?? 'Unknown error returned by the MCP server.';
      throw new Error(errorMessage);
    }

    const result = data?.result;
    if (!result) {
      throw new Error('The MCP server did not return a result.');
    }

    const text = Array.isArray(result.content)
      ? result.content
          .filter((item: any) => item?.type === 'text' && typeof item.text === 'string')
          .map((item: any) => item.text as string)
          .join('\n\n')
      : '';

    if (result.isError) {
      throw new Error(text || 'The MCP server reported an error.');
    }

    return {
      text: text || 'No additional catalog information was returned.',
      raw: data,
    };
  }
}
