# MCP Catalog Backend

This backend plugin exposes Backstage catalog data through the Model Context Protocol (MCP).
It provides a `catalog.search` MCP tool that performs full-text catalog queries so that MCP
clients—such as an LLM-powered chatbot—can retrieve rich context about entities registered in
Backstage.

## Installation

Install the package in your backend:

```bash
yarn --cwd packages/backend add @backstage/plugin-mcp-catalog-backend
```

Then register the plugin in `packages/backend/src/index.ts`:

```ts
const backend = createBackend();
// ...
backend.add(import('@backstage/plugin-mcp-catalog-backend'));
```

The MCP endpoints will be available at `/api/mcp-catalog/v1` (Streamable HTTP)
and `/api/mcp-catalog/v1/sse` (legacy SSE).
