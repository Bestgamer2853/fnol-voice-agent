import 'dotenv/config';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

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
  lastSentMessage?: string;
  turnLock?: Promise<void>;
  abortController?: AbortController;
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

const rateLimits = new Map<string, { count: number, resetAt: number }>();

function rateLimit(req: Request, res: Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limit = 50;
  const windowMs = 60 * 1000;

  let record = rateLimits.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + windowMs };
  } else {
    record.count++;
  }
  rateLimits.set(ip, record);

  if (record.count > limit) {
    sendError(res, 429, 'Too many requests');
    return;
  }
  next();
}

function requireAuth(req: Request, res: Response, next: express.NextFunction) {
  const secret = process.env.API_SECRET;
  if (!secret) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${secret}`) {
    return next();
  }
  sendError(res, 401, 'Unauthorized');
}

app.use('/chat', rateLimit, requireAuth);

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
    const sessionRecord = sessions.get(session.sessionId)!;

    try {
      const prevLock = sessionRecord.turnLock || Promise.resolve();
      let turnResult: any;

      const executeTurn = async () => {
        turnResult = await conversationManager.handleUserMessage(
          sessionRecord.state,
          userMessage,
        );
        updateSession(session.sessionId, turnResult.state);
      };

      const currentLock = prevLock.then(() => {}, () => {}).then(executeTurn);
      sessionRecord.turnLock = currentLock.then(() => {}, () => {});
      
      await currentLock;
      const result = turnResult;

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
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<string>();

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function formatLogMsg(msg: string) {
  const reqId = requestContext.getStore();
  const prefix = reqId ? `[Request ${reqId}] ` : '';
  return `${prefix}${msg}`;
}

console.log = function(...args) {
  if (typeof args[0] === 'string') {
    args[0] = formatLogMsg(args[0]);
  }
  originalConsoleLog.apply(console, args);
};

console.error = function(...args) {
  if (typeof args[0] === 'string') {
    args[0] = formatLogMsg(args[0]);
  }
  originalConsoleError.apply(console, args);
};

// Global log buffer for /view-logs endpoint
const runtimeLogs: string[] = [];

function logInfo(msg: string) {
  const reqId = requestContext.getStore();
  const prefix = reqId ? `[Request ${reqId}] ` : '';
  const formatted = `[INFO] [${new Date().toISOString()}] ${prefix}${msg}`;
  runtimeLogs.push(formatted);
  if (runtimeLogs.length > 1000) runtimeLogs.shift();
  originalConsoleLog(formatted);
}

function logError(msg: string, err?: any) {
  const reqId = requestContext.getStore();
  const prefix = reqId ? `[Request ${reqId}] ` : '';
  const formatted = `[ERROR] [${new Date().toISOString()}] ${prefix}${msg}${err ? ' ' + String(err?.stack || err) : ''}`;
  runtimeLogs.push(formatted);
  if (runtimeLogs.length > 1000) runtimeLogs.shift();
  originalConsoleError(formatted);
}

function sendWsJson(ws: WebSocket, payload: any, tag: string) {
  const payloadStr = JSON.stringify(payload);
  const scrubbed = { ...payload };
  if ('content' in scrubbed) scrubbed.content = '[REDACTED]';
  if ('transcript' in scrubbed) scrubbed.transcript = '[REDACTED]';
  logInfo(`[${tag}] Outgoing JSON sent to Retell: ${JSON.stringify(scrubbed)}`);
  ws.send(payloadStr, (err) => {
    if (err) {
      logError(`[${tag}] ws.send completed with error`, err);
    } else {
      logInfo(`[${tag}] ws.send completed successfully`);
    }
  });
}

app.get('/view-logs', (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production') {
    res.status(403).send('Forbidden in production');
    return;
  }
  res.type('text/plain').send(runtimeLogs.join('\n'));
});

// Per-session processing lock to prevent duplicate LLM calls
const activeResponseIds = new Map<string, number>();

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = app.listen(port, () => {
  const envModel = process.env.GEMINI_MODEL?.trim();
  const activeModel = envModel || 'gemini-3.5-flash-lite';
  logInfo(`\n--------------------------------`);
  logInfo(`Gemini Provider`);
  logInfo(`Model: ${activeModel}`);
  logInfo(`Source: ${envModel ? 'Environment' : 'Default'}`);
  logInfo(`--------------------------------\n`);
  
  const rawKey = process.env.GEMINI_API_KEY || '';
  const maskedKey = rawKey.length > 12 ? rawKey.substring(0, 12) + '...' : 'NOT_SET_OR_TOO_SHORT';
  logInfo(`API Key : ${maskedKey}`);
  logInfo(`Billing : Paid`);
  logInfo(`====================================\n`);
  logInfo(`FNOL backend listening on port ${port}`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  logInfo(`Retell connected via WebSocket: ${req.url}`);
  
  const secret = process.env.API_SECRET;
  if (secret) {
    const authHeader = req.headers['authorization'];
    let urlSecret = null;
    try {
      urlSecret = new URL('http://localhost' + (req.url || '')).searchParams.get('secret');
    } catch(e) {}
    
    if (authHeader !== `Bearer ${secret}` && urlSecret !== secret) {
      logError('Unauthorized WebSocket connection');
      ws.close(1008, 'Unauthorized');
      return;
    }
  }

  // Every call gets its own isolated session
  const session = createSession();
  const sessionId = session.sessionId;
  logInfo(`Session created: ${sessionId}`);
  logInfo(`Initial step: ${session.state.currentConversationStep}`);
  logInfo(`Initial greeting: ${session.state.lastAssistantMessage}`);

  const currentRecord = sessions.get(sessionId);
  if (currentRecord && session.state.lastAssistantMessage) {
      currentRecord.lastSentMessage = session.state.lastAssistantMessage;
  }

  let hasGreeted = false;

  // 1. Proactive Config Transmission
  const configPayload = {
    response_type: 'config',
    config: {
      auto_reconnect: true,
      call_details: true,
    }
  };
  sendWsJson(ws, configPayload, 'Config');

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
  sendWsJson(ws, greetingPayload, 'Greeting');
  hasGreeted = true;
  
  logInfo(`Current conversation step after: ${session.state.currentConversationStep}`);

  ws.on('close', (code, reason) => {
    logInfo(`\n========================\nWEBSOCKET CLOSED`);
    logInfo(`Close code: ${code}`);
    logInfo(`Reason: ${reason.toString()}`);
    logInfo(`Timestamp: ${new Date().toISOString()}\n========================\n`);
  });

  ws.on('error', (err) => {
    logError(`WEBSOCKET ERROR`, err);
  });

  ws.on('message', (data) => {
    const rawData = data.toString();
    logInfo(`\n========================\nRAW WEBSOCKET MESSAGE\n${rawData}\n========================\n`);
    try {
      const event = JSON.parse(rawData);
      logInfo(`\n--------------------------------`);
      logInfo(`interaction_type: ${event.interaction_type}`);
      logInfo(`response_id: ${event.response_id}`);
      logInfo(`turntaking: ${event.turntaking || 'N/A'}`);
      logInfo(`transcript length: ${event.transcript ? event.transcript.length : 0}`);
      logInfo(`call id: ${event.call ? event.call.call_id : 'N/A'}`);
      logInfo(`timestamp: ${new Date().toISOString()}`);
      logInfo(`--------------------------------\n`);

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
          sendWsJson(ws, payload, 'CallDetailsGreeting');
          hasGreeted = true;
          logInfo(`Current conversation step after: ${currentRecord?.state.currentConversationStep ?? session.state.currentConversationStep}`);
        } else {
          logInfo(`Already greeted, skipping duplicate greeting on call_details.`);
        }
        return;
      }

      if (event.interaction_type === 'ping_pong') {
        const pongPayload = {
          response_type: 'ping_pong',
          timestamp: event.timestamp,
        };
        sendWsJson(ws, pongPayload, 'PingPong');
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
        sendWsJson(ws, payload, 'Ping');
        return;
      }

      if (event.interaction_type === 'update_only') {
        logInfo(`\n==================================\nUPDATE ONLY\nNo LLM Invoked\n==================================\n`);
        return;
      }

      if (event.interaction_type === 'response_required' || event.interaction_type === 'reminder_required') {
        console.log(`[Diagnostic] RECEIVED response_required event for session ${sessionId}`);
        logInfo(`Executing handleResponseRequired() / handleReminderRequired()`);
        
        const responseId = event.response_id;
        const currentActive = activeResponseIds.get(sessionId);
        if (currentActive !== undefined && currentActive >= responseId) {
            logInfo(`Already processing a newer or equal turn for session ${sessionId} (active: ${currentActive}, received: ${responseId}), ignoring`);
            return;
        }
        
        activeResponseIds.set(sessionId, responseId);

        const currentRec = sessions.get(sessionId);
        if (!currentRec) {
          logError(`FATAL: Session ${sessionId} not found in Map!`);
          return;
        }

        if (currentRec.abortController) {
            currentRec.abortController.abort();
        }
        const abortController = new AbortController();
        currentRec.abortController = abortController;

        const requestId = crypto.randomBytes(3).toString('hex');

        requestContext.run(requestId, () => {
          (async () => {
            try {
              const transcript = event.transcript || [];
              const lastUserTurn = [...transcript].reverse().find((t: any) => t.role === 'user');
              
              if (!lastUserTurn) {
                  const fallbackMsg = currentRec.state.lastAssistantMessage ?? "I'm here to help. Could you please go ahead?";
                  if (currentRec.lastSentMessage === fallbackMsg) {
                      logInfo(`Skipping duplicate fallback: "${fallbackMsg}"`);
                      return;
                  }
                  logInfo(`No user turn found, sending fallback: "${fallbackMsg}"`);
                  currentRec.lastSentMessage = fallbackMsg;
                  const payload = {
                    response_type: 'response',
                    response_id: responseId,
                    content: fallbackMsg,
                    content_complete: true,
                    end_call: false,
                  };
                  sendWsJson(ws, payload, 'FallbackNoTurn');
                  return;
              }

              const prevLock = currentRec.turnLock || Promise.resolve();
              let turnResult: any;
              
              const executeTurn = async () => {
                if (activeResponseIds.get(sessionId) !== responseId) {
                    throw new Error('AbortError: Superseded before starting');
                }
                
                const currentState = currentRec.state;
                
                logInfo(`Current conversation step before: ${currentState.currentConversationStep}`);
                logInfo(`Collected fields: ${JSON.stringify(currentState.collectedFields)}`);
                logInfo(`Missing fields: ${JSON.stringify(currentState.missingFields)}`);
                logInfo(`Last user turn length: ${lastUserTurn.content?.length ?? 0}`);
                
                if (currentState.currentConversationStep === 'verification') {
                  logInfo(`Executing handleVerification()`);
                }

                let numLlmCalls = 0; 
                const startTime = Date.now();
                let streamedText = '';
                
                let parseState = {
                    foundStart: false,
                    isEnded: false,
                    buffer: '',
                    emittedLength: 0,
                    firstTokenTime: 0,
                };

                const result = await conversationManager.handleUserMessage(
                  currentState,
                  lastUserTurn.content,
                  (chunk: string) => {
                    if (activeResponseIds.get(sessionId) !== responseId) return; 
                    streamedText += chunk;
                    if (parseState.isEnded) return;
                    
                    parseState.buffer += chunk;
                    if (!parseState.foundStart) {
                        const idx = parseState.buffer.indexOf('"responseToUser":');
                        if (idx !== -1) {
                            const quoteIdx = parseState.buffer.indexOf('"', idx + 17);
                            if (quoteIdx !== -1) {
                                parseState.foundStart = true;
                                parseState.buffer = parseState.buffer.slice(quoteIdx + 1);
                            } else {
                                return;
                            }
                        } else {
                            return;
                        }
                    }
                    
                    if (parseState.foundStart) {
                        let endIndex = -1;
                        for (let i = 0; i < parseState.buffer.length; i++) {
                            if (parseState.buffer[i] === '"' && (i === 0 || parseState.buffer[i-1] !== '\\')) {
                                endIndex = i;
                                break;
                            }
                        }
                        
                        let textReady = endIndex !== -1 ? parseState.buffer.slice(0, endIndex) : parseState.buffer;
                        if (endIndex !== -1) parseState.isEnded = true;
                        
                        textReady = textReady.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        
                        const newText = textReady.slice(parseState.emittedLength);
                        if (newText.length > 0) {
                            if (parseState.firstTokenTime === 0) {
                                parseState.firstTokenTime = Date.now() - startTime;
                            }
                            parseState.emittedLength += newText.length;
                            sendWsJson(ws, {
                              response_type: 'response',
                              response_id: responseId,
                              content: newText,
                              content_complete: false,
                            }, 'StreamChunk');
                        }
                    }
                  },
                  abortController.signal
                );
                
                if (activeResponseIds.get(sessionId) !== responseId) {
                    logInfo(`[Request ${requestId}] Aborting completion for response_id ${responseId} because a newer turn is active.`);
                    return;
                }
                const latencyMs = Date.now() - startTime;
                
                numLlmCalls = result.debugMetrics?.geminiResponse === '' ? 1 : 1;

                const turnLog = [
                  `\n==================================`,
                  `TURN # ${currentState.conversationHistory.length / 2 + 1}`,
                  `Request ID: ${requestId}`,
                  `Interaction Type: ${event.interaction_type}`,
                  `LLM Calls: ${numLlmCalls}`,
                  `Prompt Tokens: ${(result.debugMetrics?.usageMetadata as any)?.promptTokenCount ?? 0}`,
                  `Completion Tokens: ${(result.debugMetrics?.usageMetadata as any)?.candidatesTokenCount ?? 0}`,
                  `TTFB (HTTP Status): ${result.debugMetrics?.ttfbMs ?? 0}ms`,
                  `TTFT (First SSE chunk): ${result.debugMetrics?.ttftMs ?? 0}ms`,
                  `First Token Streamed to Retell: ${parseState.firstTokenTime}ms`,
                  `Total Turn Latency: ${latencyMs}ms`,
                  `Retries: ${result.debugMetrics?.retries ?? 0}`,
                  `Conversation Step: ${result.state.currentConversationStep}`,
                  `Missing Fields: ${result.state.missingFields.join(', ')}`,
                  `==================================\n`
                ].join('\n');
                logInfo(turnLog);

                updateSession(sessionId, result.state);
                turnResult = { result, parseState };
              };

              const currentLock = prevLock.then(() => {}, () => {}).then(executeTurn);
              currentRec.turnLock = currentLock.then(() => {}, () => {});
              
              await currentLock;
              if (!turnResult) return; // Superseded or aborted
              const { result, parseState } = turnResult;

              const isComplete = result.action.type === 'complete';
              
              logInfo(`Current conversation step after: ${result.state.currentConversationStep}`);
              logInfo(`Response action type: ${result.action.type}`);
              logInfo(`Response message length: ${result.action.message?.length ?? 0}`);
              
              let finalContent = parseState.emittedLength === 0 ? (result.action.message || '') : '';
              const fullSentMessage = result.action.message || '';
              
              const updatedRec = sessions.get(sessionId);
              if (updatedRec) {
                  if (updatedRec.lastSentMessage === fullSentMessage.trim()) {
                      logInfo(`Skipping duplicate final response: "${fullSentMessage.trim()}"`);
                      return;
                  }
                  updatedRec.lastSentMessage = fullSentMessage.trim();
              }

              sendWsJson(ws, {
                response_type: 'response',
                response_id: responseId,
                content: finalContent,
                content_complete: true,
                end_call: isComplete,
              }, 'FinalResponse');

              if (isComplete) {
                  logInfo(`Call complete for session ${sessionId}`);
              }
            } catch (err: any) {
                if (err?.message?.includes('AbortError')) {
                    logInfo(`Turn ${responseId} aborted.`);
                } else {
                    logError('Error in processing turn:', err);
                }
            } finally {
                if (activeResponseIds.get(sessionId) === responseId) {
                    activeResponseIds.delete(sessionId);
                }
                logInfo(`Processing finished (resolved or rejected) for response_id ${responseId}`);
            }
          })();
        });
      }
    } catch (err) {
      logError('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    logInfo(`Connection closed for session ${sessionId}`);
    activeResponseIds.delete(sessionId);
  });
  
  ws.on('error', (error) => {
    logError(`Error for session ${sessionId}:`, error);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection at:', promise);
  logError('Reason:', reason);
});

process.on('uncaughtException', (err) => {
  logError('Uncaught Exception:', err);
});
