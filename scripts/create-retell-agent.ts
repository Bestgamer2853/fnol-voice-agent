import 'dotenv/config';

interface RetellResponseEngine {
  type: 'custom-llm';
  llm_websocket_url: string;
}

interface RetellAgentConfig {
  agent_name: string;
  response_engine: RetellResponseEngine;
  voice_id: string;
  responsiveness?: number;
  interruption_sensitivity?: number;
  voice_speed?: number;
  voice_temperature?: number;
  enable_backchannel?: boolean;
}

const RETELL_API_BASE = 'https://api.retellai.com';
const DEFAULT_WS_URL = 'wss://fnol-voice-agent-production.up.railway.app/';
const DEFAULT_AGENT_NAME = 'Meridian Insurance FNOL Agent';
const DEFAULT_VOICE_ID = '11labs-Adrian';

export async function createOrUpdateRetellAgent(options?: {
  apiKey?: string;
  wsUrl?: string;
  agentName?: string;
  voiceId?: string;
}) {
  const apiKey = (options?.apiKey || process.env.RETELL_API_KEY || '').trim();
  const wsUrl = (options?.wsUrl || process.env.RETELL_WS_URL || DEFAULT_WS_URL).trim();
  const agentName = options?.agentName || DEFAULT_AGENT_NAME;
  const voiceId = options?.voiceId || DEFAULT_VOICE_ID;

  if (!apiKey) {
    console.error('❌ Error: RETELL_API_KEY environment variable or argument is missing.');
    console.error('Usage: RETELL_API_KEY=key_... npm run retell:create-agent');
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  console.log('==================================================');
  console.log('RETELL CUSTOM LLM AGENT PROVISIONER');
  console.log('==================================================');
  console.log(`- API Key Prefix:  ${apiKey.slice(0, 10)}...`);
  console.log(`- WebSocket URL:   ${wsUrl}`);
  console.log(`- Agent Name:      ${agentName}`);
  console.log(`- Voice ID:        ${voiceId}`);
  console.log('--------------------------------------------------');

  try {
    // 1. Check existing agents
    console.log('[1/3] Querying existing Retell agents...');
    const listRes = await fetch(`${RETELL_API_BASE}/list-agents`, { headers });

    if (!listRes.ok) {
      const errText = await listRes.text();
      throw new Error(`Failed to list Retell agents (HTTP ${listRes.status}): ${errText}`);
    }

    const agents: any[] = await listRes.json();
    const existingAgent = agents.find((a: any) => a.agent_name === agentName);

    const payload: RetellAgentConfig = {
      agent_name: agentName,
      response_engine: {
        type: 'custom-llm',
        llm_websocket_url: wsUrl,
      },
      voice_id: voiceId,
      responsiveness: 1.0,
      interruption_sensitivity: 1.0,
      voice_speed: 1.0,
      voice_temperature: 1.0,
      enable_backchannel: true,
    };

    let resultAgent: any;

    if (existingAgent) {
      console.log(`[2/3] Found existing agent (${existingAgent.agent_id}). Updating configuration...`);
      const updateRes = await fetch(`${RETELL_API_BASE}/update-agent/${existingAgent.agent_id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Failed to update Retell agent (HTTP ${updateRes.status}): ${errText}`);
      }
      resultAgent = await updateRes.json();
      console.log(`✅ Agent updated successfully!`);
    } else {
      console.log('[2/3] No existing agent found. Creating new Custom LLM agent...');
      const createRes = await fetch(`${RETELL_API_BASE}/create-agent`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Failed to create Retell agent (HTTP ${createRes.status}): ${errText}`);
      }
      resultAgent = await createRes.json();
      console.log(`✅ Agent created successfully!`);
    }

    console.log('--------------------------------------------------');
    console.log('[3/3] AGENT PROVISIONING SUMMARY');
    console.log('--------------------------------------------------');
    console.log(`- Agent ID:               ${resultAgent.agent_id}`);
    console.log(`- Agent Name:             ${resultAgent.agent_name}`);
    console.log(`- Response Engine Type:   ${resultAgent.response_engine?.type}`);
    console.log(`- LLM WebSocket URL:      ${resultAgent.response_engine?.llm_websocket_url}`);
    console.log(`- Voice ID:               ${resultAgent.voice_id}`);
    console.log(`- Interruption Sensitivity: ${resultAgent.interruption_sensitivity}`);
    console.log(`- Responsiveness:         ${resultAgent.responsiveness}`);
    console.log('==================================================');

    return resultAgent;
  } catch (err: any) {
    console.error('❌ Retell Agent Provisioning Failed:', err.message || err);
    process.exit(1);
  }
}

if (process.argv[1]?.includes('create-retell-agent')) {
  createOrUpdateRetellAgent();
}
