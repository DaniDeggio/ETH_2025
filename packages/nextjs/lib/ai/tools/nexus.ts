'use server';

import { getTokens } from '@civic/auth/nextjs';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { experimental_createMCPClient } from 'ai';

export type NexusToolset = Awaited<ReturnType<
  Awaited<ReturnType<typeof experimental_createMCPClient>>['tools']
>>;

export interface NexusToolsResult {
  tools: NexusToolset;
  close: () => Promise<void>;
}

export async function getNexusTools(): Promise<NexusToolsResult | null> {
  const nexusUrl = process.env.CIVIC_NEXUS_URL;
  const nexusServiceToken = process.env.CIVIC_NEXUS_SERVICE_TOKEN;

  if (!nexusUrl || !nexusServiceToken) {
    return null;
  }

  const tokens = await getTokens();
  const userIdToken = tokens?.idToken;

  if (!userIdToken) {
    return null;
  }

  const url = new URL(nexusUrl);

  const clientConfig = {
    name: 'civic-nexus-client',
    headers: {
      Authorization: `Bearer ${nexusServiceToken}`,
      'X-Civic-User-ID-Token': userIdToken,
    },
    transport: new StreamableHTTPClientTransport(url),
  } as const;

  const client = await experimental_createMCPClient(
    clientConfig as unknown as Parameters<typeof experimental_createMCPClient>[0],
  );

  try {
    const tools = await client.tools();

    return {
      tools,
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}
