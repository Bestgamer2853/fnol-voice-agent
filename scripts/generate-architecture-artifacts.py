import os
import math
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# =============================================================================
# COLOR PALETTE (Google / Stripe / AWS Enterprise Standard)
# =============================================================================
COLOR_HEADER_BG = colors.HexColor('#0f172a')  # Slate 900
COLOR_TEXT_MAIN = colors.HexColor('#0f172a')  # Slate 900
COLOR_TEXT_MUTED = colors.HexColor('#64748b') # Slate 500
COLOR_BORDER = colors.HexColor('#cbd5e1')     # Slate 300
COLOR_CONTAINER_BG = colors.HexColor('#f8fafc') # Slate 50

COLOR_GREY = colors.HexColor('#475569')      # User / External Actor (Slate 600)
COLOR_BLUE = colors.HexColor('#2563eb')      # Voice Platform / Gateway (Blue 600)
COLOR_GREEN = colors.HexColor('#059669')     # Core Backend & Orchestration (Emerald 600)
COLOR_ORANGE = colors.HexColor('#d97706')    # AI / Model Engine (Amber 600)
COLOR_PURPLE = colors.HexColor('#7c3aed')    # External Storage & API (Violet 600)
COLOR_RED = colors.HexColor('#dc2626')       # Escalation / Safety Guardrail (Red 600)

# =============================================================================
# CANVAS HELPER FUNCTIONS
# =============================================================================
def draw_header_footer(c, page_num, title, subtitle):
    # Header Bar
    c.setFillColor(COLOR_HEADER_BG)
    c.rect(0, 555, 792, 57, fill=True, stroke=False)
    
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 13)
    c.drawString(30, 584, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE")
    
    c.setFillColor(colors.HexColor('#94a3b8'))
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(762, 584, f"DIAGRAM {page_num} OF 4: {title.upper()}")
    
    # Subtitle bar
    c.setFillColor(colors.HexColor('#f1f5f9'))
    c.rect(0, 532, 792, 23, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica-Oblique", 8.5)
    c.drawString(30, 539, subtitle)
    
    # Footer Line
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(0.5)
    c.line(30, 28, 762, 28)
    
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(30, 16, "Version: v2.0.0 (Streamlined Principal Deck)  |  Target: Meridian FNOL Engine  |  Scope: Production Solutions Review")
    c.drawRightString(762, 16, f"Page {page_num} of 4")

    # Legend at bottom right
    legend_x = 490
    legend_y = 16
    items = [
        ("User", COLOR_GREY),
        ("Platform", COLOR_BLUE),
        ("Backend", COLOR_GREEN),
        ("AI Engine", COLOR_ORANGE),
        ("External API", COLOR_PURPLE)
    ]
    for text, color in items:
        c.setFillColor(color)
        c.rect(legend_x, legend_y - 2, 7, 7, fill=True, stroke=False)
        c.setFillColor(COLOR_TEXT_MAIN)
        c.drawString(legend_x + 10, legend_y - 1, text)
        legend_x += 52

def draw_card(c, x, y, width, height, title, subtitle, color, fill_color=colors.HexColor('#ffffff'), text_lines=None, dashed_border=False):
    c.setStrokeColor(color)
    c.setFillColor(fill_color)
    c.setLineWidth(1.2)
    if dashed_border:
        c.setDash(4, 3)
    c.roundRect(x, y, width, height, 4, fill=True, stroke=True)
    c.setDash()
    
    # Header bar inside card
    c.setFillColor(color)
    c.roundRect(x, y + height - 22, width, 22, 4, fill=True, stroke=False)
    c.rect(x, y + height - 22, width, 4, fill=True, stroke=False)
    
    # Title
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x + 8, y + height - 15, title)
    
    # Subtitle
    if subtitle:
        c.setFillColor(COLOR_TEXT_MUTED)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(x + 8, y + height - 37, subtitle)
    
    if text_lines:
        c.setFillColor(COLOR_TEXT_MAIN)
        c.setFont("Helvetica", 8)
        ly = y + height - 52
        for line in text_lines:
            c.drawString(x + 8, ly, line)
            ly -= 11.5

def draw_container_box(c, x, y, width, height, title, subtitle, color):
    c.setStrokeColor(color)
    c.setFillColor(COLOR_CONTAINER_BG)
    c.setLineWidth(1.2)
    c.setDash(4, 4)
    c.roundRect(x, y, width, height, 6, fill=True, stroke=True)
    c.setDash()
    
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(x + 10, y + height - 16, title)
    if subtitle:
        c.setFillColor(COLOR_TEXT_MUTED)
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(x + 10, y + height - 28, subtitle)

def draw_arrow(c, x1, y1, x2, y2, label="", dashed=False, color=COLOR_TEXT_MUTED):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.2)
    if dashed:
        c.setDash(4, 3)
    else:
        c.setDash()
    c.line(x1, y1, x2, y2)
    c.setDash()
    
    # Arrowhead calculation
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_size = 6
    p1x = x2 - arrow_size * math.cos(angle - math.pi/6)
    p1y = y2 - arrow_size * math.sin(angle - math.pi/6)
    p2x = x2 - arrow_size * math.cos(angle + math.pi/6)
    p2y = y2 - arrow_size * math.sin(angle + math.pi/6)
    
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(p1x, p1y)
    p.lineTo(p2x, p2y)
    p.close()
    c.drawPath(p, fill=True, stroke=False)
    
    if label:
        c.setFillColor(color)
        c.setFont("Helvetica-Bold", 7.5)
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        ox = -math.sin(angle) * 6
        oy = math.cos(angle) * 6
        c.drawCentredString(mid_x + ox, mid_y + oy - 2.5, label)

# =============================================================================
# DIAGRAM 1: C4 SYSTEM CONTEXT & CONTAINER ARCHITECTURE
# =============================================================================
def render_diagram1(c):
    draw_header_footer(
        c, 1, 
        "System Context & Container Topology (C4 Level 1 & 2)", 
        "High-level boundary, telephony gateway, backend container architecture, and external SaaS integrations"
    )
    
    # 1. External Actors
    draw_container_box(c, 30, 85, 140, 425, "1. CLIENTS & CALLERS", "Inbound Access", COLOR_GREY)
    draw_card(c, 40, 360, 120, 75, "PSTN Caller", "Phone Call", COLOR_GREY, text_lines=["• Inbound Audio", "• Caller ID & Voice"])
    draw_card(c, 40, 230, 120, 75, "Browser Demo UI", "Web client", COLOR_GREY, text_lines=["• WebRTC / WS Client", "• Debug Dashboard"])

    # 2. Voice Platform
    draw_container_box(c, 190, 85, 150, 425, "2. VOICE PLATFORM", "Retell AI Telephony", COLOR_BLUE)
    draw_card(c, 200, 320, 130, 115, "Retell AI Engine", "Custom LLM Agent", COLOR_BLUE, text_lines=["• STT / TTS Audio Pipeline", "• Barge-In Detection", "• Agent: agent_e907d3...", "• Event Streaming"])

    # 3. Core Railway Cloud Container Boundary
    draw_container_box(c, 360, 85, 250, 425, "3. BACKEND CONTAINER (RAILWAY CLOUD)", "Node.js ESM Runtime | Port 3000", COLOR_GREEN)
    
    draw_card(c, 380, 420, 210, 60, "Express & WS Server", "server.ts", COLOR_GREEN, text_lines=["• HTTP / WS Server (Port 3000)", "• Session State Map"])
    draw_card(c, 380, 335, 210, 70, "ConversationManager", "Core Orchestration", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• State Transitions & Guardrails", "• Policy & Field Tracking"])
    draw_card(c, 380, 250, 210, 70, "LLM Extraction Service", "extractClaimData.ts", COLOR_GREEN, text_lines=["• SSE Stream Parser", "• Fallback Field Patching"])
    draw_card(c, 380, 170, 210, 65, "Claim Logger & Outbox", "claimLogger.ts", COLOR_GREEN, text_lines=["• Multi-Logger Orchestrator", "• Local JSON Backup"])
    draw_card(c, 380, 100, 210, 55, "Notification Service", "notificationService.ts", COLOR_GREEN, text_lines=["• Resend Email Client"])

    # 4. External Services
    draw_container_box(c, 630, 85, 135, 425, "4. SAAS APIS", "External Integrations", COLOR_PURPLE)
    draw_card(c, 640, 360, 115, 80, "Gemini 2.5 Flash", "Primary AI Engine", COLOR_ORANGE, text_lines=["• Native SSE REST API", "• <700ms TTFT Latency"])
    draw_card(c, 640, 230, 115, 80, "Google Sheets API", "Structured DB", COLOR_PURPLE, text_lines=["• Sheet v4 REST API", "• Auto Header Format"])
    draw_card(c, 640, 100, 115, 80, "Resend Email API", "Transactional Mail", COLOR_PURPLE, text_lines=["• REST SDK (v3)", "• Verified Sender"])

    # Connectors
    draw_arrow(c, 160, 395, 200, 380, "Voice")
    draw_arrow(c, 160, 265, 200, 340, "WSS")
    
    draw_arrow(c, 330, 375, 380, 445, "WSS Connect")
    draw_arrow(c, 485, 420, 485, 405)
    draw_arrow(c, 485, 335, 485, 320)
    draw_arrow(c, 485, 250, 485, 235)
    draw_arrow(c, 485, 170, 485, 155)

    draw_arrow(c, 590, 285, 640, 395, "HTTPS SSE", False, COLOR_ORANGE)
    draw_arrow(c, 590, 200, 640, 265, "Async Log", True, COLOR_PURPLE)
    draw_arrow(c, 590, 130, 640, 140, "Async Mail", True, COLOR_PURPLE)

# =============================================================================
# DIAGRAM 2: C4 COMPONENT ARCHITECTURE (CONVERSATION MANAGER)
# =============================================================================
def render_diagram2(c):
    draw_header_footer(
        c, 2, 
        "Domain Component Architecture (C4 Level 3)", 
        "Decoupled service components executing turn validation, policy lookup, extraction, and recommendations"
    )
    
    # Central Orchestrator
    draw_card(c, 276, 425, 240, 75, "ConversationManager", "src/conversation/ConversationManager.ts", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Turn Orchestrator & Action Dispatcher", "• FSM State Machine Engine & Invariants", "• Session History & Slot Tracking"])

    # 4 Core Processing Components (Top Row)
    draw_card(c, 30, 275, 165, 90, "VerifyPolicyService", "src/services/verifyPolicy.ts", COLOR_GREEN, text_lines=["• Validates Policy # & Name", "• Reads policies.json DB", "• Enforces 2-Retry Limit", "• Offers Callback on Fail"])
    
    draw_card(c, 215, 275, 165, 90, "ExtractClaimDataService", "src/services/extractClaimData.ts", COLOR_GREEN, text_lines=["• Prompts Gemini 2.5 SSE", "• Fallback Regex Matcher", "• JSON Slot Sanitizer", "• Calculates Token Metrics"])

    draw_card(c, 400, 275, 165, 90, "NormalizeClaimData", "src/services/normalizeClaimData.ts", COLOR_GREEN, text_lines=["• Spoken Phonetic Cleaner", "• Normalizes License Plates", "• Converts Relative Dates", "• Standardizes Vehicles"])

    draw_card(c, 585, 275, 165, 90, "RecommendServices", "src/services/recommendServices.ts", COLOR_GREEN, text_lines=["• Checks Entitlements", "• Recommends Towing", "• Recommends Garages", "• Out-of-Pocket Rules"])

    # 4 Output & Persistence Components (Bottom Row)
    draw_card(c, 30, 105, 165, 90, "GenerateSummaryService", "src/services/generateSummary.ts", COLOR_GREEN, text_lines=["• Synthesizes Claim Summary", "• Classifies Severity Level", "• Summarizes Incidents", "• Formats Log Output"])

    draw_card(c, 215, 105, 165, 90, "ClaimLoggerService", "src/storage/googleSheets.ts", COLOR_GREEN, text_lines=["• Appends Rows to Sheet", "• Auto-Formats Headers", "• Handles Google Auth", "• Writes Local JSON Outbox"])

    draw_card(c, 400, 105, 165, 90, "NotificationService", "src/services/notificationService.ts", COLOR_GREEN, text_lines=["• Sends Resend Emails", "• Formats HTML/Text Mail", "• Priority Urgent Badges", "• Handles Sandbox Fallback"])

    draw_card(c, 585, 105, 165, 90, "EmpathyEngine", "src/config/EmpathyEngine.ts", COLOR_GREEN, text_lines=["• Distress Phrase Detector", "• Warm Spoken Openers", "• Calming Response Rules", "• Compliance Tone Check"])

    # Connectors from Orchestrator down to components
    top_targets = [112, 297, 482, 667]
    for tx in top_targets:
        draw_arrow(c, 396, 425, tx, 365, "Invokes")
        draw_arrow(c, tx, 275, tx, 195, "Flows to")

# =============================================================================
# DIAGRAM 3: UML SEQUENCE FLOW & ASYNC PERSISTENCE
# =============================================================================
def render_diagram3(c):
    draw_header_footer(
        c, 3, 
        "End-to-End Sequence & Non-Blocking Async Persistence", 
        "Low-latency real-time voice turns paired with asynchronous background logging & notification"
    )
    
    lifelines = [
        ("Caller", 75, COLOR_GREY),
        ("Retell AI", 195, COLOR_BLUE),
        ("Railway Server", 335, COLOR_GREEN),
        ("Conv Manager", 475, COLOR_GREEN),
        ("Gemini 2.5", 615, COLOR_ORANGE),
        ("Sheets & Resend", 735, COLOR_PURPLE)
    ]
    
    for name, lx, color in lifelines:
        c.setFillColor(color)
        c.roundRect(lx - 45, 480, 90, 26, 4, fill=True, stroke=False)
        c.setFillColor(colors.HexColor('#ffffff'))
        c.setFont("Helvetica-Bold", 8.5)
        c.drawCentredString(lx, 491, name)
        
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(1)
        c.setDash(4, 4)
        c.line(lx, 480, lx, 60)
        c.setDash()

    def seq_msg(x1, x2, y, text, async_call=False):
        draw_arrow(c, x1, y, x2, y, text, async_call, COLOR_PURPLE if async_call else COLOR_TEXT_MAIN)

    y = 445
    seq_msg(75, 195, y, "1. Inbound Phone Call"); y -= 32
    seq_msg(195, 335, y, "2. WS Connect & call_details"); y -= 32
    seq_msg(335, 195, y, "3. Spoken Greeting (\"Are you safe?\")"); y -= 32
    seq_msg(75, 195, y, "4. \"Yes safe. Policy MMI-10234 Arjun.\""); y -= 32
    seq_msg(195, 335, y, "5. response_required"); y -= 32
    seq_msg(335, 475, y, "6. handleUserMessage()"); y -= 32
    seq_msg(475, 615, y, "7. extract(userMessage, state) [SSE]"); y -= 32
    seq_msg(615, 475, y, "8. Extracted Slots + Spoken Text"); y -= 32
    seq_msg(475, 335, y, "9. Verified Policy & Response Text"); y -= 32
    seq_msg(335, 195, y, "10. response { content } (Audio Plays)"); y -= 42
    
    # Async Block highlight
    c.setStrokeColor(COLOR_PURPLE)
    c.setFillColor(colors.HexColor('#f3e8ff'))
    c.setLineWidth(1.2)
    c.setDash(4, 3)
    c.roundRect(415, y - 55, 360, 80, 4, fill=True, stroke=True)
    c.setDash()
    
    c.setFillColor(COLOR_PURPLE)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(425, y + 10, "NON-BLOCKING ASYNC PERSISTENCE (Post-Response)")
    
    seq_msg(475, 735, y - 10, "11. Promise.resolve -> claimLogger.log()", True); y -= 32
    seq_msg(475, 735, y - 10, "12. Promise.resolve -> sendClaimConfirmation()", True)

# =============================================================================
# DIAGRAM 4: FINITE STATE MACHINE (FSM) & COMPLIANCE ENGINE
# =============================================================================
def render_diagram4(c):
    draw_header_footer(
        c, 4, 
        "Claim Finite State Machine (FSM) & Compliance Engine", 
        "100% deterministic safety guardrails, policy verification limits, field collection, and completion gates"
    )
    
    cw, ch = 150, 52
    
    # State Nodes Layout
    draw_card(c, 321, 415, cw, ch, "safety_check", "Initial Greeting", COLOR_BLUE, text_lines=["• Asks if everyone is safe", "• Scans for severe crash"])
    draw_card(c, 90, 315, cw, ch, "escalation", "Emergency Alert", COLOR_RED, colors.HexColor('#fef2f2'), text_lines=["• High Severity Flagged", "• Advises 911 / Emergency"])
    draw_card(c, 552, 315, cw, ch, "verification", "Policy Lookup", COLOR_GREEN, text_lines=["• Policy # + Name Check", "• DB Lookup in policies.json"])
    
    draw_card(c, 90, 215, cw, ch, "callback_offer", "Verification Failed", COLOR_ORANGE, text_lines=["• 2 Retries Exceeded", "• Schedules Human Callback"])
    draw_card(c, 552, 215, cw, ch, "collecting_details", "FNOL Collection", COLOR_GREEN, text_lines=["• Required Fields Gate", "• Conditional Injury Details"])
    
    draw_card(c, 90, 115, cw, ch, "clarifying", "Invalid Input", COLOR_BLUE, text_lines=["• Malformed Reg Plate", "• Prompts for Repetition"])
    draw_card(c, 552, 115, cw, ch, "recommending_services", "Service Entitlements", COLOR_GREEN, text_lines=["• Towing & Garage Offer", "• Policy Limit Checks"])
    
    draw_card(c, 321, 45, cw, ch, "completed", "Claim Persisted", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Sheet & Email Dispatched", "• Final Spoken Summary"])

    # State Transitions with clear labels
    draw_arrow(c, 321, 440, 240, 367, "Injuries / Severe", color=COLOR_RED)
    draw_arrow(c, 471, 440, 552, 367, "Safe / No Injuries", color=COLOR_GREEN)
    
    draw_arrow(c, 552, 340, 240, 267, "Attempts >= 2", color=COLOR_ORANGE)
    draw_arrow(c, 627, 315, 627, 267, "Verified Policy", color=COLOR_GREEN)
    
    draw_arrow(c, 552, 240, 240, 167, "Malformed Reg", color=COLOR_BLUE)
    draw_arrow(c, 627, 215, 627, 167, "Fields Complete", color=COLOR_GREEN)
    
    draw_arrow(c, 240, 140, 552, 240, "Reg Clarified", color=COLOR_GREEN)
    
    draw_arrow(c, 165, 315, 321, 71, "Close Call", color=COLOR_RED)
    draw_arrow(c, 165, 215, 321, 71, "Close Call", color=COLOR_ORANGE)
    draw_arrow(c, 627, 115, 471, 71, "Complete Claim", color=COLOR_GREEN)

# =============================================================================
# MAIN BUILD PIPELINE
# =============================================================================
def build_all_artifacts():
    pdf_path = os.path.join(BASE_DIR, 'Architecture.pdf')
    png_path = os.path.join(BASE_DIR, 'Architecture.png')
    
    c = canvas.Canvas(pdf_path, pagesize=landscape(letter))
    
    # 4 Streamlined Diagrams
    for page_fn in [render_diagram1, render_diagram2, render_diagram3, render_diagram4]:
        page_fn(c)
        c.showPage()
        
    c.save()
    print(f"✅ Generated 4-Page Streamlined PDF: {pdf_path}")

    # High-Res PNG (Page 1 preview) at 300 DPI
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    pix.save(png_path)
    print(f"✅ Rendered 300 DPI high-res PNG preview: {png_path}")

if __name__ == '__main__':
    build_all_artifacts()
