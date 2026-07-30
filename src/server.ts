import 'dotenv/config';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type Request, type Response } from 'express';

import type { ConversationState } from './conversation/ConversationState.js';
import { createRuntimeConversationManager } from './runtime.js';

interface ChatRequestBody {
  sessionId?: unknown;
  userMessage?: unknown;
}

interface SessionRecord {
  state: ConversationState;
  updatedAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_PORT = 3000;
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(moduleDirectory, '../public');

const app = express();
const conversationManager = createRuntimeConversationManager();
const sessions = new Map<string, SessionRecord>();

function createSessionId(): string {
  return crypto.randomUUID();
}

function pruneExpiredSessions(now = Date.now()): void {
  for (const [sessionId, record] of sessions.entries()) {
    if (now - record.updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

function createSession(): { sessionId: string; state: ConversationState } {
  const sessionId = createSessionId();
  const state = conversationManager.start();

  sessions.set(sessionId, {
    state,
    updatedAt: Date.now(),
  });

  return { sessionId, state };
}

function getOrCreateSession(sessionId: unknown): {
  sessionId: string;
  state: ConversationState;
} {
  pruneExpiredSessions();

  if (typeof sessionId === 'string') {
    const existingSession = sessions.get(sessionId);

    if (existingSession) {
      existingSession.updatedAt = Date.now();
      return {
        sessionId,
        state: existingSession.state,
      };
    }
  }

  return createSession();
}

function updateSession(sessionId: string, state: ConversationState): void {
  sessions.set(sessionId, {
    state,
    updatedAt: Date.now(),
  });
}

function sendError(response: Response, status: number, error: string): void {
  response.status(status).json({ error });
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicDirectory));

app.post('/chat/start', (_request: Request, response: Response) => {
  const session = createSession();

  response.json({
    sessionId: session.sessionId,
    assistantResponse: session.state.lastAssistantMessage,
    state: {
      currentConversationStep: session.state.currentConversationStep,
      missingFields: session.state.missingFields,
    },
  });
});

app.post(
  '/chat',
  async (
    request: Request<Record<string, never>, unknown, ChatRequestBody>,
    response: Response,
  ) => {
    const userMessage = request.body.userMessage;

    if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      sendError(response, 400, 'userMessage is required.');
      return;
    }

    const session = getOrCreateSession(request.body.sessionId);

    try {
      const result = await conversationManager.handleUserMessage(
        session.state,
        userMessage,
      );

      updateSession(session.sessionId, result.state);

      const responsePayload: Record<string, unknown> = {
        sessionId: session.sessionId,
        assistantResponse: result.action.message,
        actionType: result.action.type,
        state: {
          currentConversationStep: result.state.currentConversationStep,
          missingFields: result.state.missingFields,
          severity: result.state.severity,
          escalationRequired: result.state.escalationRequired,
        },
      };

      if (result.action.type === 'complete') {
        responsePayload.claimReferenceNumber =
          result.action.claim.claimReferenceNumber;
        responsePayload.confirmation = {
          type: 'email',
          to: `${result.state.verifiedPolicy?.policyholderName?.replace(/\s+/g, '.').toLowerCase() ?? 'policyholder'}@example.com`,
          message: `Subject: Claim ${result.action.claim.claimReferenceNumber ?? 'N/A'} Logged\n\nDear ${result.state.verifiedPolicy?.policyholderName ?? 'Policyholder'},\n\nYour FNOL claim has been logged. A claims adjuster will contact you within 24 hours. For queries, call 1800-MERIDIAN.`,
        };
      }

      response.json(responsePayload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      console.error('Unhandled /chat error:', message);
      sendError(
        response,
        500,
        'Sorry, the claims assistant could not process that message. Please try again.',
      );
    }
  },
);

import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = app.listen(port, () => {
  console.log(`FNOL backend listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  console.log('Retell connected via WebSocket:', req.url);
  
  // Every call gets its own isolated session
  const session = createSession();
  let responseId = 0;

  ws.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());

      if (event.interaction_type === 'call_details' || event.interaction_type === 'ping') {
        // Send initial greeting on connection
        ws.send(
          JSON.stringify({
            response_id: responseId,
            content: session.state.lastAssistantMessage,
            content_complete: true,
            end_call: false,
          })
        );
        return;
      }

      if (event.interaction_type === 'response_required' || event.interaction_type === 'reminder_required') {
        responseId = event.response_id;
        
        // Find the latest user message from the transcript
        const transcript = event.transcript || [];
        const lastUserTurn = [...transcript].reverse().find((t: any) => t.role === 'user');
        
        if (!lastUserTurn) {
            // Nothing to process, just repeat assistant's last message
            ws.send(
              JSON.stringify({
                response_id: responseId,
                content: session.state.lastAssistantMessage,
                content_complete: true,
                end_call: false,
              })
            );
            return;
        }

        const result = await conversationManager.handleUserMessage(
          session.state,
          lastUserTurn.content
        );

        updateSession(session.sessionId, result.state);

        const isComplete = result.action.type === 'complete';
        
        ws.send(
          JSON.stringify({
            response_id: responseId,
            content: result.action.message,
            content_complete: true,
            end_call: isComplete,
          })
        );

        if (isComplete) {
            console.log(`Call complete for session ${session.sessionId}`);
        }
      }
    } catch (err) {
      console.error('WebSocket error processing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Retell connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

