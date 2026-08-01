import os
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# -----------------------------------------------------------------------------
# 1. DRAW.IO XML GENERATOR (Architecture.drawio & Architecture.xml)
# -----------------------------------------------------------------------------
def generate_drawio_xml():
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" modified="2026-08-01T13:00:00.000Z" agent="Antigravity Architecture Generator" version="21.6.8" type="device">
  <diagram id="fnol-voice-agent-arch" name="Meridian FNOL Voice Agent Architecture">
    <mxGraphModel dx="1422" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1920" pageHeight="1080" background="#0f172a" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- TITLE -->
        <mxCell id="title" value="MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=22;fontStyle=1;fontColor=#f8fafc;" vertex="1" parent="1">
          <mxGeometry x="460" y="20" width="1000" height="40" as="geometry" />
        </mxCell>

        <!-- SUBTITLE -->
        <mxCell id="subtitle" value="Production Solutions Architecture &amp; Hybrid FSM/LLM Data Flow Pipeline" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=13;fontColor=#94a3b8;" vertex="1" parent="1">
          <mxGeometry x="560" y="55" width="800" height="25" as="geometry" />
        </mxCell>

        <!-- CONTAINER: CLIENT LAYER -->
        <mxCell id="box_client" value="CLIENT LAYER" style="swimlane;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#3b82f6;fontColor=#93c5fd;fontStyle=1;startSize=30;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="100" width="220" height="240" as="geometry" />
        </mxCell>
        <mxCell id="node_caller" value="📞 Telephony Caller&#xa;(PSTN Phone Call)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#60a5fa;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_client">
          <mxGeometry x="20" y="45" width="180" height="60" as="geometry" />
        </mxCell>
        <mxCell id="node_browser" value="💻 Browser Demo UI&#xa;(WebRTC / WS Client)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#60a5fa;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_client">
          <mxGeometry x="20" y="140" width="180" height="60" as="geometry" />
        </mxCell>

        <!-- CONTAINER: VOICE PLATFORM -->
        <mxCell id="box_voice" value="VOICE PLATFORM (RETELL AI)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#8b5cf6;fontColor=#c4b5fd;fontStyle=1;startSize=30;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="300" y="100" width="240" height="240" as="geometry" />
        </mxCell>
        <mxCell id="node_retell_stt" value="🎙️ Retell Telephony &amp; STT&#xa;(Audio Streaming Engine)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#a78bfa;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_voice">
          <mxGeometry x="20" y="45" width="200" height="60" as="geometry" />
        </mxCell>
        <mxCell id="node_retell_agent" value="🤖 Custom LLM Agent&#xa;(agent_e907d38b...)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#a78bfa;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_voice">
          <mxGeometry x="20" y="140" width="200" height="60" as="geometry" />
        </mxCell>

        <!-- CONTAINER: BACKEND & ORCHESTRATION -->
        <mxCell id="box_backend" value="BACKEND &amp; ORCHESTRATION (RAILWAY CLOUD)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#10b981;fontColor=#6ee7b7;fontStyle=1;startSize=30;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="580" y="100" width="340" height="240" as="geometry" />
        </mxCell>
        <mxCell id="node_ws_gateway" value="🔌 WebSocket Gateway &amp; Express&#xa;(wss://fnol-voice-agent...)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#34d399;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_backend">
          <mxGeometry x="20" y="45" width="300" height="50" as="geometry" />
        </mxCell>
        <mxCell id="node_cm" value="🧠 ConversationManager Orchestrator&#xa;(State Transitions &amp; Business Rules)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#34d399;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_backend">
          <mxGeometry x="20" y="115" width="300" height="50" as="geometry" />
        </mxCell>
        <mxCell id="node_fsm" value="🔄 ConversationState Machine&#xa;(safety | verification | collecting | completed)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#34d399;fontColor=#f8fafc;fontSize=11;" vertex="1" parent="box_backend">
          <mxGeometry x="20" y="180" width="300" height="45" as="geometry" />
        </mxCell>

        <!-- CONTAINER: AI & EXTRACTION -->
        <mxCell id="box_ai" value="AI &amp; EXTRACTION LAYER" style="swimlane;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#f59e0b;fontColor=#fcd34d;fontStyle=1;startSize=30;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="960" y="100" width="260" height="240" as="geometry" />
        </mxCell>
        <mxCell id="node_gemini" value="✨ Gemini 2.5 Flash Lite&#xa;(Native SSE Stream Engine)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#fbbf24;fontColor=#f8fafc;fontSize=12;fontStyle=1;" vertex="1" parent="box_ai">
          <mxGeometry x="20" y="80" width="220" height="90" as="geometry" />
        </mxCell>

        <!-- CONTAINER: PERSISTENCE & NOTIFICATIONS -->
        <mxCell id="box_persistence" value="PERSISTENCE &amp; NOTIFICATIONS (ASYNC)" style="swimlane;whiteSpace=wrap;html=1;fillColor=#1e293b;strokeColor=#ec4899;fontColor=#fbcfe8;fontStyle=1;startSize=30;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="1260" y="100" width="300" height="240" as="geometry" />
        </mxCell>
        <mxCell id="node_sheets" value="📊 Google Sheets API&#xa;(Structured Claim Database)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#f472b6;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_persistence">
          <mxGeometry x="20" y="45" width="260" height="55" as="geometry" />
        </mxCell>
        <mxCell id="node_resend" value="✉️ Resend REST Email API&#xa;(claims@aurallon.com)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#f472b6;fontColor=#f8fafc;fontSize=12;" vertex="1" parent="box_persistence">
          <mxGeometry x="20" y="115" width="260" height="55" as="geometry" />
        </mxCell>
        <mxCell id="node_inbox" value="📥 Recipient Inbox&#xa;(aurallonbiz@gmail.com)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#f472b6;fontColor=#f8fafc;fontSize=11;" vertex="1" parent="box_persistence">
          <mxGeometry x="20" y="180" width="260" height="45" as="geometry" />
        </mxCell>

        <!-- CONNECTORS -->
        <mxCell id="edge1" edge="1" parent="1" source="node_caller" target="node_retell_stt" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#60a5fa;strokeWidth=2;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge2" edge="1" parent="1" source="node_retell_agent" target="node_ws_gateway" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#a78bfa;strokeWidth=2;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge3" edge="1" parent="1" source="node_ws_gateway" target="node_cm" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#34d399;strokeWidth=2;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge4" edge="1" parent="1" source="node_cm" target="node_gemini" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#fbbf24;strokeWidth=2;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge5" edge="1" parent="1" source="node_cm" target="node_sheets" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#f472b6;strokeWidth=2;dashed=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge6" edge="1" parent="1" source="node_cm" target="node_resend" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#f472b6;strokeWidth=2;dashed=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="edge7" edge="1" parent="1" source="node_resend" target="node_inbox" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#f472b6;strokeWidth=2;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
"""
    drawio_path = os.path.join(BASE_DIR, 'Architecture.drawio')
    xml_path = os.path.join(BASE_DIR, 'Architecture.xml')

    with open(drawio_path, 'w', encoding='utf-8') as f:
        f.write(xml_content)

    with open(xml_path, 'w', encoding='utf-8') as f:
        f.write(xml_content)

    print(f"✅ Generated {drawio_path} and {xml_path}")

# -----------------------------------------------------------------------------
# 2. VECTOR SVG GENERATOR (Architecture.svg)
# -----------------------------------------------------------------------------
def generate_svg():
    svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1280" width="1920" height="1280" style="background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <!-- STYLES -->
  <style>
    .title { font-size: 26px; font-weight: 800; fill: #f8fafc; text-anchor: middle; letter-spacing: 1px; }
    .subtitle { font-size: 14px; font-weight: 500; fill: #94a3b8; text-anchor: middle; }
    .section-title { font-size: 16px; font-weight: 700; fill: #38bdf8; letter-spacing: 0.5px; }
    .card-bg { fill: #1e293b; stroke-width: 1.5; rx: 12; ry: 12; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3)); }
    .box-bg { fill: #0f172a; stroke-width: 1.5; rx: 8; ry: 8; }
    .node-title { font-size: 13px; font-weight: 700; fill: #f8fafc; }
    .node-desc { font-size: 11px; fill: #94a3b8; }
    .edge { fill: none; stroke-width: 2; stroke-dasharray: none; }
    .edge-async { fill: none; stroke-width: 2; stroke-dasharray: 6,4; }
    .badge { font-size: 10px; font-weight: 700; fill: #ffffff; }
  </style>

  <!-- BACKGROUND DECORATION -->
  <rect width="1920" height="1280" fill="#0f172a" />
  <circle cx="200" cy="150" r="300" fill="#3b82f6" opacity="0.03" />
  <circle cx="1700" cy="1000" r="400" fill="#8b5cf6" opacity="0.03" />

  <!-- HEADER -->
  <text x="960" y="45" class="title">MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE</text>
  <text x="960" y="75" class="subtitle">Production Solutions Architecture, Sequence Request Flow &amp; Finite State Machine Topology</text>

  <!-- ========================================================================= -->
  <!-- 1. HIGH-LEVEL SYSTEM ARCHITECTURE (TOP HALF) -->
  <!-- ========================================================================= -->
  <text x="50" y="125" class="section-title">1. HIGH LEVEL SYSTEM ARCHITECTURE</text>

  <!-- Client Layer -->
  <rect x="50" y="145" width="260" height="240" class="card-bg" stroke="#3b82f6" />
  <text x="70" y="175" font-size="14" font-weight="700" fill="#60a5fa">CLIENT LAYER</text>
  <rect x="70" y="195" width="220" height="70" class="box-bg" stroke="#3b82f6" />
  <text x="85" y="225" class="node-title">📞 Telephony Caller</text>
  <text x="85" y="245" class="node-desc">Inbound PSTN / WebRTC Call</text>
  <rect x="70" y="285" width="220" height="70" class="box-bg" stroke="#3b82f6" />
  <text x="85" y="315" class="node-title">💻 Browser Demo UI</text>
  <text x="85" y="335" class="node-desc">Hosted Voice Agent Simulator</text>

  <!-- Voice Platform -->
  <rect x="360" y="145" width="280" height="240" class="card-bg" stroke="#8b5cf6" />
  <text x="380" y="175" font-size="14" font-weight="700" fill="#c4b5fd">VOICE PLATFORM (RETELL AI)</text>
  <rect x="380" y="195" width="240" height="70" class="box-bg" stroke="#8b5cf6" />
  <text x="395" y="225" class="node-title">🎙️ Retell Telephony &amp; STT</text>
  <text x="395" y="245" class="node-desc">Real-time Audio &amp; Barge-in</text>
  <rect x="380" y="285" width="240" height="70" class="box-bg" stroke="#8b5cf6" />
  <text x="395" y="315" class="node-title">🤖 Custom LLM Agent</text>
  <text x="395" y="335" class="node-desc">agent_e907d38b5b5dcdf4cf...</text>

  <!-- Backend Orchestration -->
  <rect x="690" y="145" width="400" height="240" class="card-bg" stroke="#10b981" />
  <text x="710" y="175" font-size="14" font-weight="700" fill="#6ee7b7">BACKEND &amp; ORCHESTRATION (RAILWAY CLOUD)</text>
  <rect x="710" y="195" width="360" height="55" class="box-bg" stroke="#10b981" />
  <text x="725" y="220" class="node-title">🔌 WebSocket Gateway (wss://...)</text>
  <text x="725" y="238" class="node-desc">Express HTTP Port 3000 / ws server</text>
  <rect x="710" y="260" width="360" height="55" class="box-bg" stroke="#10b981" />
  <text x="725" y="285" class="node-title">🧠 ConversationManager Orchestrator</text>
  <text x="725" y="303" class="node-desc">Turn Orchestration &amp; Deterministic Rules</text>
  <rect x="710" y="325" width="360" height="45" class="box-bg" stroke="#10b981" />
  <text x="725" y="348" class="node-title">🔄 ConversationState Machine</text>

  <!-- AI & Extraction Layer -->
  <rect x="1140" y="145" width="310" height="240" class="card-bg" stroke="#f59e0b" />
  <text x="1160" y="175" font-size="14" font-weight="700" fill="#fcd34d">AI &amp; EXTRACTION LAYER</text>
  <rect x="1160" y="210" width="270" height="120" class="box-bg" stroke="#f59e0b" />
  <text x="1175" y="250" font-size="15" font-weight="800" fill="#fbbf24">✨ Gemini 2.5 Flash Lite</text>
  <text x="1175" y="275" class="node-desc">Primary Native SSE Engine (&lt;700ms)</text>
  <text x="1175" y="295" class="node-desc">Structured Extraction &amp; Empathetic Voice</text>

  <!-- Persistence & Notifications -->
  <rect x="1500" y="145" width="370" height="240" class="card-bg" stroke="#ec4899" />
  <text x="1520" y="175" font-size="14" font-weight="700" fill="#fbcfe8">PERSISTENCE &amp; NOTIFICATIONS (ASYNC)</text>
  <rect x="1520" y="195" width="330" height="55" class="box-bg" stroke="#ec4899" />
  <text x="1535" y="220" class="node-title">📊 Google Sheets API (Claim Database)</text>
  <text x="1535" y="238" class="node-desc">Sheet ID: 1bRu1nK9IL8a7DCSXSQ-jX...</text>
  <rect x="1520" y="260" width="330" height="55" class="box-bg" stroke="#ec4899" />
  <text x="1535" y="285" class="node-title">✉️ Resend REST Email API (v3)</text>
  <text x="1535" y="303" class="node-desc">Sender: claims@aurallon.com</text>
  <rect x="1520" y="325" width="330" height="45" class="box-bg" stroke="#ec4899" />
  <text x="1535" y="348" class="node-title">📥 Recipient: aurallonbiz@gmail.com</text>

  <!-- CONNECTORS (TOP HALF) -->
  <line x1="290" y1="230" x2="380" y2="230" class="edge" stroke="#60a5fa" />
  <line x1="620" y1="320" x2="710" y2="222" class="edge" stroke="#a78bfa" />
  <line x1="1070" y1="287" x2="1160" y2="270" class="edge" stroke="#34d399" />
  <line x1="1070" y1="287" x2="1520" y2="222" class="edge-async" stroke="#ec4899" />
  <line x1="1070" y1="287" x2="1520" y2="287" class="edge-async" stroke="#ec4899" />

  <!-- ========================================================================= -->
  <!-- 2. SEQUENCE REQUEST FLOW & FINITE STATE MACHINE (BOTTOM HALF) -->
  <!-- ========================================================================= -->
  
  <!-- SEQUENCE DIAGRAM (LEFT BOTTOM) -->
  <text x="50" y="435" class="section-title">3. REQUEST FLOW &amp; NON-BLOCKING ASYNC PERSISTENCE</text>
  <rect x="50" y="455" width="980" height="780" class="card-bg" stroke="#3b82f6" />
  
  <!-- Lifelines -->
  <text x="120" y="485" class="node-title" fill="#60a5fa">Caller</text>
  <line x1="135" y1="500" x2="135" y2="1200" stroke="#334155" stroke-dasharray="4,4" />

  <text x="290" y="485" class="node-title" fill="#c4b5fd">Retell AI</text>
  <line x1="315" y1="500" x2="315" y2="1200" stroke="#334155" stroke-dasharray="4,4" />

  <text x="470" y="485" class="node-title" fill="#6ee7b7">Railway Server</text>
  <line x1="510" y1="500" x2="510" y2="1200" stroke="#334155" stroke-dasharray="4,4" />

  <text x="680" y="485" class="node-title" fill="#fcd34d">Gemini 2.5</text>
  <line x1="710" y1="500" x2="710" y2="1200" stroke="#334155" stroke-dasharray="4,4" />

  <text x="860" y="485" class="node-title" fill="#fbcfe8">Sheets &amp; Resend</text>
  <line x1="910" y1="500" x2="910" y2="1200" stroke="#334155" stroke-dasharray="4,4" />

  <!-- Sequence Messages -->
  <!-- 1. Call Init -->
  <line x1="135" y1="530" x2="315" y2="530" class="edge" stroke="#60a5fa" />
  <text x="145" y="525" class="node-desc" fill="#93c5fd">1. Initiates Phone / Web Call</text>

  <line x1="315" y1="560" x2="510" y2="560" class="edge" stroke="#a78bfa" />
  <text x="325" y="555" class="node-desc" fill="#c4b5fd">2. WS Connect (wss://fnol-voice-agent...)</text>

  <line x1="315" y1="590" x2="510" y2="590" class="edge" stroke="#a78bfa" />
  <text x="325" y="585" class="node-desc" fill="#c4b5fd">3. call_details { call_id: "..." }</text>

  <line x1="510" y1="630" x2="315" y2="630" class="edge" stroke="#34d399" />
  <text x="335" y="625" class="node-desc" fill="#6ee7b7">4. Greeting ("Before we begin, are you safe?")</text>

  <!-- 2. User Utterance -->
  <line x1="135" y1="670" x2="315" y2="670" class="edge" stroke="#60a5fa" />
  <text x="145" y="665" class="node-desc" fill="#93c5fd">5. "Yes safe. Policy MMI-10234 Arjun Rao."</text>

  <line x1="315" y1="700" x2="510" y2="700" class="edge" stroke="#a78bfa" />
  <text x="325" y="695" class="node-desc" fill="#c4b5fd">6. response_required { response_id: 1 }</text>

  <line x1="510" y1="740" x2="710" y2="740" class="edge" stroke="#34d399" />
  <text x="520" y="735" class="node-desc" fill="#6ee7b7">7. extract(userMessage, state) [SSE Stream]</text>

  <line x1="710" y1="780" x2="510" y2="780" class="edge" stroke="#fbbf24" />
  <text x="525" y="775" class="node-desc" fill="#fcd34d">8. Extracted Slots + Surface Spoken Response</text>

  <rect x="440" y="805" width="220" height="35" fill="#0f172a" stroke="#34d399" rx="4" />
  <text x="450" y="827" font-size="11" font-weight="700" fill="#34d399">9. verifyPolicy() -> VERIFIED</text>

  <line x1="510" y1="865" x2="315" y2="865" class="edge" stroke="#34d399" />
  <text x="325" y="860" class="node-desc" fill="#6ee7b7">10. response { content: "When did it happen?" }</text>

  <!-- Async Logging Box -->
  <rect x="420" y="910" width="520" height="240" fill="#1e1b4b" stroke="#818cf8" stroke-dasharray="6,4" rx="8" />
  <text x="440" y="935" font-size="12" font-weight="700" fill="#a5b4fc">NON-BLOCKING ASYNC PERSISTENCE &amp; EMAIL DISPATCH</text>
  
  <line x1="510" y1="970" x2="910" y2="970" class="edge-async" stroke="#f472b6" />
  <text x="530" y="963" class="node-desc" fill="#fbcfe8">11. claimLogger.log() -> Append Row to Google Sheet</text>

  <line x1="910" y1="1000" x2="510" y2="1000" class="edge-async" stroke="#f472b6" />
  <text x="530" y="993" class="node-desc" fill="#fbcfe8">12. Google Sheets API 200 OK</text>

  <line x1="510" y1="1050" x2="910" y2="1050" class="edge-async" stroke="#f472b6" />
  <text x="530" y="1043" class="node-desc" fill="#fbcfe8">13. sendClaimConfirmation() -> claims@aurallon.com</text>

  <line x1="910" y1="1080" x2="510" y2="1080" class="edge-async" stroke="#f472b6" />
  <text x="530" y="1073" class="node-desc" fill="#fbcfe8">14. Resend 200 OK (Message ID: de32e35f...)</text>

  <!-- CLAIM STATE MACHINE (RIGHT BOTTOM) -->
  <text x="1070" y="435" class="section-title">4. CLAIM FINITE STATE MACHINE (FSM)</text>
  <rect x="1070" y="455" width="800" height="780" class="card-bg" stroke="#8b5cf6" />

  <!-- FSM States -->
  <rect x="1330" y="485" width="280" height="50" class="box-bg" stroke="#a78bfa" />
  <text x="1470" y="515" class="node-title" text-anchor="middle">safety_check (Initial Greeting)</text>

  <rect x="1120" y="585" width="280" height="50" class="box-bg" stroke="#ef4444" />
  <text x="1260" y="615" class="node-title" text-anchor="middle" fill="#fca5a5">escalation (Urgent Alert)</text>

  <rect x="1540" y="585" width="280" height="50" class="box-bg" stroke="#34d399" />
  <text x="1680" y="615" class="node-title" text-anchor="middle">verification (Policy Lookup)</text>

  <rect x="1120" y="685" width="280" height="50" class="box-bg" stroke="#f59e0b" />
  <text x="1260" y="715" class="node-title" text-anchor="middle" fill="#fcd34d">callback_offer (2 Retries Failed)</text>

  <rect x="1540" y="685" width="280" height="50" class="box-bg" stroke="#34d399" />
  <text x="1680" y="715" class="node-title" text-anchor="middle">collecting_details (FNOL Fields)</text>

  <rect x="1120" y="785" width="280" height="50" class="box-bg" stroke="#60a5fa" />
  <text x="1260" y="815" class="node-title" text-anchor="middle" fill="#93c5fd">clarifying (Invalid Reg / Ambiguity)</text>

  <rect x="1540" y="785" width="280" height="50" class="box-bg" stroke="#34d399" />
  <text x="1680" y="815" class="node-title" text-anchor="middle">recommending_services (Towing/Garage)</text>

  <rect x="1330" y="900" width="280" height="60" fill="#10b981" stroke="#34d399" rx="8" />
  <text x="1470" y="935" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle">completed (Claim Logged &amp; Sent)</text>

  <!-- FSM Transitions -->
  <line x1="1470" y1="535" x2="1260" y2="585" class="edge" stroke="#ef4444" />
  <text x="1310" y="555" class="node-desc" fill="#fca5a5">Injury / Severe crash</text>

  <line x1="1470" y1="535" x2="1680" y2="585" class="edge" stroke="#34d399" />
  <text x="1590" y="555" class="node-desc" fill="#6ee7b7">Safe / Fine</text>

  <line x1="1680" y1="635" x2="1260" y2="685" class="edge" stroke="#f59e0b" />
  <text x="1430" y="655" class="node-desc" fill="#fcd34d">Attempts &gt;= 2</text>

  <line x1="1680" y1="635" x2="1680" y2="685" class="edge" stroke="#34d399" />
  <text x="1690" y="660" class="node-desc" fill="#6ee7b7">Verified Match</text>

  <line x1="1680" y1="735" x2="1260" y2="785" class="edge" stroke="#60a5fa" />
  <text x="1430" y="755" class="node-desc" fill="#93c5fd">Malformed Reg</text>

  <line x1="1260" y1="785" x2="1680" y2="735" class="edge" stroke="#34d399" />
  <text x="1430" y="775" class="node-desc" fill="#6ee7b7">Clarification Provided</text>

  <line x1="1680" y1="735" x2="1680" y2="785" class="edge" stroke="#34d399" />
  <text x="1690" y="760" class="node-desc" fill="#6ee7b7">All Fields Collected</text>

  <line x1="1680" y1="835" x2="1470" y2="900" class="edge" stroke="#34d399" />
  <line x1="1260" y1="635" x2="1470" y2="900" class="edge" stroke="#ef4444" />
  <line x1="1260" y1="735" x2="1470" y2="900" class="edge" stroke="#f59e0b" />

</svg>
"""
    svg_path = os.path.join(BASE_DIR, 'Architecture.svg')
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg)

    print(f"✅ Generated {svg_path}")

# -----------------------------------------------------------------------------
# 3. HIGH RES PNG & PDF GENERATOR
# -----------------------------------------------------------------------------
def generate_png_and_pdf():
    png_path = os.path.join(BASE_DIR, 'Architecture.png')
    pdf_path = os.path.join(BASE_DIR, 'Architecture.pdf')

    # Draw PNG image using PIL
    width, height = 1920, 1280
    img = Image.new('RGB', (width, height), color='#0f172a')
    draw = ImageDraw.Draw(img)

    # Title & Headers
    draw.text((width // 2, 40), "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE", fill='#f8fafc', anchor='mm')
    draw.text((width // 2, 70), "Production Solutions Architecture & Sequence Request Flow", fill='#94a3b8', anchor='mm')

    # Boxes (High Level)
    draw.rectangle([50, 140, 310, 380], fill='#1e293b', outline='#3b82f6', width=2)
    draw.text((65, 155), "CLIENT LAYER", fill='#60a5fa')

    draw.rectangle([360, 140, 640, 380], fill='#1e293b', outline='#8b5cf6', width=2)
    draw.text((375, 155), "VOICE PLATFORM (RETELL AI)", fill='#c4b5fd')

    draw.rectangle([690, 140, 1090, 380], fill='#1e293b', outline='#10b981', width=2)
    draw.text((705, 155), "BACKEND & ORCHESTRATION (RAILWAY)", fill='#6ee7b7')

    draw.rectangle([1140, 140, 1450, 380], fill='#1e293b', outline='#f59e0b', width=2)
    draw.text((1155, 155), "AI & EXTRACTION LAYER", fill='#fcd34d')

    draw.rectangle([1500, 140, 1870, 380], fill='#1e293b', outline='#ec4899', width=2)
    draw.text((1515, 155), "PERSISTENCE & NOTIFICATIONS", fill='#fbcfe8')

    # Lower Panels
    draw.rectangle([50, 440, 1030, 1220], fill='#1e293b', outline='#3b82f6', width=2)
    draw.text((70, 460), "3. REQUEST FLOW & NON-BLOCKING ASYNC PERSISTENCE", fill='#38bdf8')

    draw.rectangle([1070, 440, 1870, 1220], fill='#1e293b', outline='#8b5cf6', width=2)
    draw.text((1090, 460), "4. CLAIM FINITE STATE MACHINE (FSM)", fill='#38bdf8')

    img.save(png_path)
    print(f"✅ Generated {png_path}")

    # Generate PDF using ReportLab
    c = canvas.Canvas(pdf_path, pagesize=landscape(letter))
    c.setFillColor(colors.HexColor('#0f172a'))
    c.rect(0, 0, 792, 612, fill=True, stroke=False)

    c.setFillColor(colors.HexColor('#f8fafc'))
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(396, 570, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE")

    c.setFillColor(colors.HexColor('#94a3b8'))
    c.setFont("Helvetica", 10)
    c.drawCentredString(396, 550, "Production Architecture, Sequence Flow & State Machine Specification")

    # High Level Diagram Cards
    c.setStrokeColor(colors.HexColor('#3b82f6'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(30, 380, 130, 150, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#60a5fa'))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, 515, "CLIENT LAYER")

    c.setStrokeColor(colors.HexColor('#8b5cf6'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(170, 380, 140, 150, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#c4b5fd'))
    c.drawString(180, 515, "VOICE PLATFORM")

    c.setStrokeColor(colors.HexColor('#10b981'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(320, 380, 170, 150, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#6ee7b7'))
    c.drawString(330, 515, "BACKEND & FSM")

    c.setStrokeColor(colors.HexColor('#f59e0b'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(500, 380, 130, 150, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#fcd34d'))
    c.drawString(510, 515, "AI EXTRACTION")

    c.setStrokeColor(colors.HexColor('#ec4899'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(640, 380, 120, 150, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#fbcfe8'))
    c.drawString(650, 515, "PERSISTENCE")

    # Lower Half Panels
    c.setStrokeColor(colors.HexColor('#3b82f6'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(30, 30, 350, 330, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#38bdf8'))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(45, 345, "3. REQUEST FLOW & SEQUENCE")

    c.setStrokeColor(colors.HexColor('#8b5cf6'))
    c.setFillColor(colors.HexColor('#1e293b'))
    c.roundRect(400, 30, 360, 330, 6, fill=True, stroke=True)
    c.setFillColor(colors.HexColor('#38bdf8'))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(415, 345, "4. CLAIM FINITE STATE MACHINE")

    c.save()
    print(f"✅ Generated {pdf_path}")

if __name__ == '__main__':
    generate_drawio_xml()
    generate_svg()
    generate_png_and_pdf()
