import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';

import { getNexusTools } from '@/lib/ai/tools/nexus';

type IncomingMessage = {
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

const SUPPORTED_ROLES = new Set<UIMessage['role']>(['user', 'assistant', 'system']);

export async function POST(req: Request) {
  const { messages }: { messages?: unknown } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response('`messages` must be an array.', { status: 400 });
  }

  const uiMessages: Array<Omit<UIMessage, 'id'>> = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index] as IncomingMessage;
    if (message === null || typeof message !== 'object') {
      return new Response(`Message at index ${index} must be an object.`, { status: 400 });
    }

    const role = message.role;
    if (typeof role !== 'string' || !SUPPORTED_ROLES.has(role as UIMessage['role'])) {
      return new Response(`Message at index ${index} has an unsupported role.`, { status: 400 });
    }

    const { content, parts } = message;

    if (Array.isArray(parts)) {
      uiMessages.push({
        role: role as UIMessage['role'],
        parts: normalizeParts(parts),
      });
      continue;
    }

    if (typeof content === 'string') {
      uiMessages.push({ role: role as UIMessage['role'], parts: [{ type: 'text', text: content }] });
      continue;
    }

    if (Array.isArray(content)) {
      // pass through when the client already sends UI message parts
      uiMessages.push({ role: role as UIMessage['role'], parts: normalizeParts(content) });
      continue;
    }

    return new Response(`Message at index ${index} must have a string or array content.`, { status: 400 });
  }

  const coreMessages = convertToModelMessages(uiMessages);

  const nexus = await getNexusTools();
  let closed = false;
  const closeNexus = async () => {
    if (closed || !nexus) {
      return;
    }

    closed = true;
    await nexus.close().catch(() => undefined);
  };

  try {

    const response = await streamText({
      model: openai('gpt-4o-mini'),
      messages: coreMessages,
      tools: nexus?.tools,
      onFinish: closeNexus,
      onError: closeNexus,
    });

    return response.toTextStreamResponse();
  } catch (error) {
    await closeNexus();
    console.error('Failed to process chat completion with Nexus tools.', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

function normalizeParts(parts: unknown[]): UIMessage['parts'] {
  if (isStringArray(parts)) {
    return parts.map((text) => ({ type: 'text', text })) as UIMessage['parts'];
  }

  return parts as UIMessage['parts'];
}

function isStringArray(parts: unknown[]): parts is string[] {
  return parts.every((part) => typeof part === 'string');
}
