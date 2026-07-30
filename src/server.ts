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

// Global log buffer for /view-logs endpoint
const runtimeLogs: string[] = [];

function logInfo(msg: string) {
  const formatted = `[INFO] [${new Date().toISOString()}] ${msg}`;
  runtimeLogs.push(formatted);
  console.log(formatted);
}

function logError(msg: string, err?: any) {
  const formatted = `[ERROR] [${new Date().toISOString()}] ${msg}${err ? ' ' + String(err.stack || err) : ''}`;
  runtimeLogs.push(formatted);
  console.error(formatted);
}

app.get('/view-logs', (_req: Request, res: Response) => {
  res.type('text/plain').send(runtimeLogs.join('\n'));
});

// Per-session async lock to prevent race conditions
const sessionLocks = new Map<string, Promise<void>>();

function withSessionLock(sessionId: string, fn: () => Promise<void>): Promise<void> {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve();
  const next = previous.then(fn, fn); // always chain, even if previous rejected
  sessionLocks.set(sessionId, next);
  return next;
}

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = app.listen(port, () => {
  logInfo(`FNOL backend listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  logInfo(`Retell connected via WebSocket: ${req.url}`);
  
  // Every call gets its own isolated session
  const session = createSession();
  const sessionId = session.sessionId;
  logInfo(`Session created: ${sessionId}`);
  logInfo(`Initial step: ${session.state.currentConversationStep}`);
  logInfo(`Initial greeting: ${session.state.lastAssistantMessage}`);

  let hasGreeted = false;

  // Send greeting immediately upon WebSocket connection as required by Retell protocol
  logInfo(`Executing handleGreeting() (Immediate on connection)`);
  logInfo(`Current conversation step before: ${session.state.currentConversationStep}`);
  
  const greetingPayload = {
    response_type: 'response',
    response_id: 0,
    content: session.state.lastAssistantMessage,
    content_complete: true,
    end_call: false,
  };
  logInfo(`Outgoing JSON sent to Retell: ${JSON.stringify(greetingPayload)}`);
  ws.send(JSON.stringify(greetingPayload));
  hasGreeted = true;
  
  logInfo(`Current conversation step after: ${session.state.currentConversationStep}`);

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      logInfo(`Incoming interaction_type = ${event.interaction_type}`);
      logInfo(`Entire JSON payload: ${JSON.stringify(event)}`);
      logInfo(`response_id: ${event.response_id}`);
      logInfo(`transcript: ${JSON.stringify(event.transcript)}`);
      logInfo(`transcript_with_tool_calls: ${JSON.stringify(event.transcript_with_tool_calls)}`);
      logInfo(`metadata: ${JSON.stringify(event.metadata)}`);
      logInfo(`call_id: ${event.call ? event.call.call_id : 'N/A'}`);

      if (event.interaction_type === 'call_details') {
        logInfo(`Executing handleCallDetails()`);
        
        if (!hasGreeted) {
          const currentRecord = sessions.get(sessionId);
          const greeting = currentRecord?.state.lastAssistantMessage ?? session.state.lastAssistantMessage;
          
          logInfo(`Executing handleGreeting()`);
          logInfo(`Current conversation step before: ${currentRecord?.state.currentConversationStep ?? session.state.currentConversationStep}`);
          
          const payload = {
            response_type: 'response',
            response_id: 0,
            content: greeting,
            content_complete: true,
            end_call: false,
          };
          logInfo(`Outgoing JSON sent to Retell: ${JSON.stringify(payload)}`);
          ws.send(JSON.stringify(payload));
          hasGreeted = true;
          logInfo(`Current conversation step after: ${currentRecord?.state.currentConversationStep ?? session.state.currentConversationStep}`);
        } else {
          logInfo(`Already greeted, skipping duplicate greeting on call_details.`);
        }
        return;
      }

      if (event.interaction_type === 'ping') {
        logInfo(`Executing handlePing()`);
        const payload = {
          response_type: 'response',
          response_id: event.response_id ?? 0,
          content: '',
          content_complete: true,
          end_call: false,
        };
        logInfo(`Outgoing JSON sent to Retell: ${JSON.stringify(payload)}`);
        ws.send(JSON.stringify(payload));
        return;
      }

      if (event.interaction_type === 'update_only') {
        logInfo(`Executing handleUpdateOnly()`);
        return;
      }

      if (event.interaction_type === 'response_required' || event.interaction_type === 'reminder_required') {
        logInfo(`Executing handleResponseRequired() / handleReminderRequired()`);
        
        withSessionLock(sessionId, async () => {
          const responseId = event.response_id;
          
          const transcript = event.transcript || [];
          const lastUserTurn = [...transcript].reverse().find((t: any) => t.role === 'user');
          
          const currentRecord = sessions.get(sessionId);
          if (!currentRecord) {
            logError(`FATAL: Session ${sessionId} not found in Map!`);
            return;
          }
          const currentState = currentRecord.state;
          
          logInfo(`Current conversation step before: ${currentState.currentConversationStep}`);
          logInfo(`Collected fields: ${JSON.stringify(currentState.collectedFields)}`);
          logInfo(`Missing fields: ${JSON.stringify(currentState.missingFields)}`);
          logInfo(`Last user turn: ${lastUserTurn?.content ?? '(none)'}`);
          
          if (!lastUserTurn) {
              const fallbackMsg = currentState.lastAssistantMessage ?? "I'm here to help. Could you please go ahead?";
              logInfo(`No user turn found, sending fallback: "${fallbackMsg}"`);
              const payload = {
                response_type: 'response',
                response_id: responseId,
                content: fallbackMsg,
                content_complete: true,
                end_call: false,
              };
              logInfo(`Outgoing JSON sent to Retell: ${JSON.stringify(payload)}`);
              ws.send(JSON.stringify(payload));
              return;
          }

          if (currentState.currentConversationStep === 'verification') {
            logInfo(`Executing handleVerification()`);
          }

          const startTime = Date.now();
          const result = await conversationManager.handleUserMessage(
            currentState,
            lastUserTurn.content
          );
          const latencyMs = Date.now() - startTime;

          // PRODUCTION TURN LOGGING
          const turnLog = {
            callId: event.call?.call_id || sessionId,
            fsmStateBefore: currentState.currentConversationStep,
            userTranscript: lastUserTurn.content,
            extractedSlots: result.debugMetrics?.rawExtractedSlots ?? {},
            missingSlots: result.state.missingFields,
            geminiPrompt: result.debugMetrics?.geminiPrompt ?? '',
            geminiResponse: result.debugMetrics?.geminiResponse ?? '',
            latencyMs,
            fsmStateAfter: result.state.currentConversationStep,
            chosenResponse: result.action.message,
            actionType: result.action.type,
          };
          logInfo(`\n=== TURN METRICS ===\n${JSON.stringify(turnLog, null, 2)}\n====================\n`);

          // Save updated state back to the Map
          updateSession(sessionId, result.state);

          const isComplete = result.action.type === 'complete';
          
          logInfo(`Current conversation step after: ${result.state.currentConversationStep}`);
          logInfo(`Response action type: ${result.action.type}`);
          logInfo(`Response message: "${result.action.message}"`);
          
          const payload = {
            response_type: 'response',
            response_id: responseId,
            content: result.action.message,
            content_complete: true,
            end_call: isComplete,
          };
          logInfo(`Outgoing JSON sent to Retell: ${JSON.stringify(payload)}`);
          ws.send(JSON.stringify(payload));

          if (isComplete) {
              logInfo(`Call complete for session ${sessionId}`);
          }
        }).catch(err => {
          logError('Error in locked processing:', err);
        });
      }
    } catch (err) {
      logError('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    logInfo(`Connection closed for session ${sessionId}`);
    sessionLocks.delete(sessionId);
  });
  
  ws.on('error', (error) => {
    logError(`Error for session ${sessionId}:`, error);
  });
});


