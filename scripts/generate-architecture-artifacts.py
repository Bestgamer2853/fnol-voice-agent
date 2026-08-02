import os
import math
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# =============================================================================
# COLOR PALETTE (Google / Stripe / AWS Enterprise Standard - Max 5 Colors)
# =============================================================================
COLOR_HEADER_BG = colors.HexColor('#0f172a')    # Slate 900
COLOR_TEXT_MAIN = colors.HexColor('#0f172a')    # Slate 900
COLOR_TEXT_MUTED = colors.HexColor('#64748b')   # Slate 500
COLOR_BORDER = colors.HexColor('#cbd5e1')       # Slate 300
COLOR_CONTAINER_BG = colors.HexColor('#f8fafc') # Slate 50

# The 5 Canonical Role Colors
COLOR_GREY = colors.HexColor('#475569')      # 1. User / Client (Slate 600)
COLOR_BLUE = colors.HexColor('#2563eb')      # 2. Telephony Platform (Blue 600)
COLOR_GREEN = colors.HexColor('#059669')     # 3. Core Backend Container (Emerald 600)
COLOR_ORANGE = colors.HexColor('#d97706')    # 4. AI Engine (Amber 600)
COLOR_PURPLE = colors.HexColor('#7c3aed')    # 5. External Services (Violet 600)
COLOR_RED = colors.HexColor('#dc2626')       # Safety Alert / Emergency (Red 600)

# =============================================================================
# PRECISION GRAPHICS ENGINE (TIGHT HEADER & CONSISTENT MARGINS)
# =============================================================================
def draw_header_footer(c, page_num, title, subtitle):
    # Compact 36px Header Bar (Gives +45px vertical room for content)
    c.setFillColor(COLOR_HEADER_BG)
    c.rect(0, 564, 792, 48, fill=True, stroke=False)
    
    # Title Left
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25, 592, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE")
    
    # Page Tag Right
    c.setFillColor(colors.HexColor('#38bdf8')) # Sky 400
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(767, 592, f"DIAGRAM {page_num} OF 4: {title.upper()}")
    
    # Subtitle Left (Inside dark bar for clean zero-margin look)
    c.setFillColor(colors.HexColor('#94a3b8')) # Slate 400
    c.setFont("Helvetica", 8.5)
    c.drawString(25, 574, subtitle)
    
    # Footer Divider Line
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(0.5)
    c.line(25, 25, 767, 25)
    
    # Footer Left & Right
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(25, 14, "Version: v2.1.0 (Polished Architect Edition)  |  System: Meridian FNOL Engine  |  Scope: Staff Review")
    c.drawRightString(767, 14, f"Page {page_num} of 4")

    # Legend at Bottom Right
    legend_x = 495
    legend_y = 14
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
        c.setFont("Helvetica", 7.5)
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
    
    # Header bar inside card (20px tall)
    c.setFillColor(color)
    c.roundRect(x, y + height - 20, width, 20, 4, fill=True, stroke=False)
    c.rect(x, y + height - 20, width, 4, fill=True, stroke=False)
    
    # Card Title
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 8, y + height - 14, title)
    
    # Card Subtitle
    if subtitle:
        c.setFillColor(COLOR_TEXT_MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 8, y + height - 33, subtitle)
    
    # Bullet lines
    if text_lines:
        c.setFillColor(COLOR_TEXT_MAIN)
        c.setFont("Helvetica", 8)
        ly = y + height - 47
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
    
    # Vertical bounds: y=45 to y=550 (Height: 505px)
    # 1. External Clients
    draw_container_box(c, 25, 45, 145, 505, "1. CLIENTS & CALLERS", "Inbound Access", COLOR_GREY)
    draw_card(c, 35, 370, 125, 95, "PSTN Caller", "Phone Call", COLOR_GREY, text_lines=["• Inbound Audio", "• Caller ID & Voice", "• Human Spoken Input"])
    draw_card(c, 35, 210, 125, 95, "Browser Demo UI", "Web Client", COLOR_GREY, text_lines=["• WebRTC / WS Client", "• Debug Dashboard", "• Live Event Stream"])

    # 2. Voice Platform
    draw_container_box(c, 185, 45, 155, 505, "2. VOICE PLATFORM", "Retell AI Telephony", COLOR_BLUE)
    draw_card(c, 195, 290, 135, 150, "Retell AI Engine", "Custom LLM Agent", COLOR_BLUE, text_lines=["• STT / TTS Audio Pipeline", "• Barge-In Detection", "• Agent: agent_e907d3...", "• WebSocket Transport", "• Latency Buffering"])

    # 3. Core Railway Cloud Container Boundary
    draw_container_box(c, 355, 45, 260, 505, "3. BACKEND CONTAINER (RAILWAY CLOUD)", "Node.js ESM Runtime | Port 3000", COLOR_GREEN)
    
    draw_card(c, 375, 440, 220, 75, "Express & WS Server", "server.ts", COLOR_GREEN, text_lines=["• HTTP / WS Server (Port 3000)", "• Session State Map", "• Retell WSS Protocol"])
    draw_card(c, 375, 345, 220, 80, "ConversationManager", "Core Orchestration", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• FSM State Machine Engine", "• Policy & Field Tracking", "• Emergency Guardrails"])
    draw_card(c, 375, 250, 220, 80, "LLM Extraction Service", "extractClaimData.ts", COLOR_GREEN, text_lines=["• Native SSE Stream Parser", "• Fallback Regex Matcher", "• Slot Extraction Logic"])
    draw_card(c, 375, 155, 220, 80, "Claim Logger & Outbox", "claimLogger.ts", COLOR_GREEN, text_lines=["• Multi-Logger Orchestrator", "• Local JSON Outbox Backup", "• Google Sheets Client"])
    draw_card(c, 375, 65, 220, 75, "Notification Service", "notificationService.ts", COLOR_GREEN, text_lines=["• Resend REST Email SDK", "• HTML Email Renderer"])

    # 4. External Services
    draw_container_box(c, 630, 45, 140, 505, "4. SAAS APIS", "External Integrations", COLOR_PURPLE)
    draw_card(c, 640, 410, 120, 95, "Gemini 2.5 Flash Lite", "Primary AI Engine", COLOR_ORANGE, text_lines=["• Native SSE REST API", "• <700ms TTFT Latency", "• Structured JSON Schema"])
    draw_card(c, 640, 250, 120, 95, "Google Sheets API", "Structured DB", COLOR_PURPLE, text_lines=["• Sheet v4 REST API", "• Auto Header Format", "• Service Account Auth"])
    draw_card(c, 640, 90, 120, 95, "Resend Email API", "Transactional Mail", COLOR_PURPLE, text_lines=["• REST API (v3)", "• Verified Domain Sender", "• Priority Badging"])

    # Connectors
    draw_arrow(c, 160, 417, 195, 380, "Voice")
    draw_arrow(c, 160, 257, 195, 340, "WSS")
    
    draw_arrow(c, 330, 365, 375, 477, "WSS Connect")
    draw_arrow(c, 485, 440, 485, 425)
    draw_arrow(c, 485, 345, 485, 330)
    draw_arrow(c, 485, 250, 485, 235)
    draw_arrow(c, 485, 155, 485, 140)

    draw_arrow(c, 595, 290, 640, 457, "HTTPS SSE", False, COLOR_ORANGE)
    draw_arrow(c, 595, 195, 640, 297, "Async Log", True, COLOR_PURPLE)
    draw_arrow(c, 595, 102, 640, 137, "Async Mail", True, COLOR_PURPLE)

# =============================================================================
# DIAGRAM 2: C4 COMPONENT ARCHITECTURE (CONVERSATION MANAGER)
# =============================================================================
def render_diagram2(c):
    draw_header_footer(
        c, 2, 
        "Domain Component Architecture (C4 Level 3)", 
        "Decoupled service components executing turn validation, policy lookup, extraction, and recommendations"
    )
    
    # Central Orchestrator Top
    draw_card(c, 276, 435, 240, 85, "ConversationManager", "src/conversation/ConversationManager.ts", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Turn Orchestrator & Action Dispatcher", "• FSM State Machine Engine & Invariants", "• Session History & Slot Tracking"])

    # 4 Core Processing Components (Top Row)
    draw_card(c, 25, 260, 170, 125, "VerifyPolicyService", "src/services/verifyPolicy.ts", COLOR_GREEN, text_lines=["• Validates Policy # & Name", "• Reads policies.json DB", "• Enforces 2-Retry Limit", "• Offers Callback on Fail", "• Precondition for Completion"])
    
    draw_card(c, 215, 260, 170, 125, "ExtractClaimDataService", "src/services/extractClaimData.ts", COLOR_GREEN, text_lines=["• Prompts Gemini 2.5 SSE", "• Fallback Regex Matcher", "• JSON Slot Sanitizer", "• Calculates Token Metrics", "• Out-of-Order Field Capture"])

    draw_card(c, 405, 260, 170, 125, "NormalizeClaimData", "src/services/normalizeClaimData.ts", COLOR_GREEN, text_lines=["• Spoken Phonetic Cleaner", "• Normalizes License Plates", "• Converts Relative Dates", "• Standardizes Vehicle Details", "• Sanitize Text & Booleans"])

    draw_card(c, 595, 260, 170, 125, "RecommendServices", "src/services/recommendServices.ts", COLOR_GREEN, text_lines=["• Checks Entitlements", "• Recommends Towing", "• Recommends Garages", "• Out-of-Pocket Rules", "• Service Confirmation Gate"])

    # 4 Output & Persistence Components (Bottom Row)
    draw_card(c, 25, 75, 170, 125, "GenerateSummaryService", "src/services/generateSummary.ts", COLOR_GREEN, text_lines=["• Synthesizes Claim Summary", "• Classifies Severity Level", "• Summarizes Incidents", "• Formats Log Output", "• LLM Summary Generator"])

    draw_card(c, 215, 75, 170, 125, "ClaimLoggerService", "src/storage/googleSheets.ts", COLOR_GREEN, text_lines=["• Appends Rows to Sheet", "• Auto-Formats Headers", "• Handles Google Auth", "• Writes Local JSON Outbox", "• MultiClaimLogger Fallback"])

    draw_card(c, 405, 75, 170, 125, "NotificationService", "src/services/notificationService.ts", COLOR_GREEN, text_lines=["• Sends Resend Emails", "• Formats HTML/Text Mail", "• Priority Urgent Badges", "• Handles Sandbox Fallback", "• Recipient Email Dispatch"])

    draw_card(c, 595, 75, 170, 125, "EmpathyEngine", "src/config/EmpathyEngine.ts", COLOR_GREEN, text_lines=["• Distress Phrase Detector", "• Warm Spoken Openers", "• Calming Response Rules", "• Compliance Tone Check", "• Human Tone Guardrails"])

    # Connectors from Orchestrator down to components
    top_targets = [110, 300, 490, 680]
    for tx in top_targets:
        draw_arrow(c, 396, 435, tx, 385, "Invokes")
        draw_arrow(c, tx, 260, tx, 200, "Flows to")

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
        ("ConvManager", 475, COLOR_GREEN),
        ("Gemini 2.5", 615, COLOR_ORANGE),
        ("Sheets & Resend", 735, COLOR_PURPLE)
    ]
    
    for name, lx, color in lifelines:
        c.setFillColor(color)
        c.roundRect(lx - 45, 500, 90, 26, 4, fill=True, stroke=False)
        c.setFillColor(colors.HexColor('#ffffff'))
        c.setFont("Helvetica-Bold", 8.5)
        c.drawCentredString(lx, 511, name)
        
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(1)
        c.setDash(4, 4)
        c.line(lx, 500, lx, 45)
        c.setDash()

    def seq_msg(x1, x2, y, text, async_call=False):
        draw_arrow(c, x1, y, x2, y, text, async_call, COLOR_PURPLE if async_call else COLOR_TEXT_MAIN)

    y = 465
    seq_msg(75, 195, y, "1. Inbound Phone Call"); y -= 33
    seq_msg(195, 335, y, "2. WS Connect & call_details"); y -= 33
    seq_msg(335, 195, y, "3. Spoken Greeting (\"Are you safe?\")"); y -= 33
    seq_msg(75, 195, y, "4. \"Yes safe. Policy MMI-10234 Arjun.\""); y -= 33
    seq_msg(195, 335, y, "5. response_required"); y -= 33
    seq_msg(335, 475, y, "6. handleUserMessage()"); y -= 33
    seq_msg(475, 615, y, "7. extract(userMessage, state) [SSE]"); y -= 33
    seq_msg(615, 475, y, "8. Extracted Slots + Spoken Text"); y -= 33
    seq_msg(475, 335, y, "9. Verified Policy & Response Text"); y -= 33
    seq_msg(335, 195, y, "10. response { content } (Audio Plays)"); y -= 45
    
    # Async Block highlight
    c.setStrokeColor(COLOR_PURPLE)
    c.setFillColor(colors.HexColor('#f3e8ff'))
    c.setLineWidth(1.2)
    c.setDash(4, 3)
    c.roundRect(415, y - 60, 360, 85, 4, fill=True, stroke=True)
    c.setDash()
    
    c.setFillColor(COLOR_PURPLE)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawString(425, y + 12, "NON-BLOCKING ASYNC PERSISTENCE (Post-Response)")
    
    seq_msg(475, 735, y - 10, "11. Promise.resolve -> claimLogger.log()", True); y -= 33
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
    
    cw, ch = 155, 62
    
    # State Nodes Layout with 45px more vertical space
    draw_card(c, 318, 445, cw, ch, "safety_check", "Initial Greeting", COLOR_BLUE, text_lines=["• Asks if everyone is safe", "• Scans for severe crash"])
    draw_card(c, 80, 325, cw, ch, "escalation", "Emergency Alert", COLOR_RED, colors.HexColor('#fef2f2'), text_lines=["• High Severity Flagged", "• Advises 911 / Emergency"])
    draw_card(c, 555, 325, cw, ch, "verification", "Policy Lookup", COLOR_GREEN, text_lines=["• Policy # + Name Check", "• DB Lookup in policies.json"])
    
    draw_card(c, 80, 205, cw, ch, "callback_offer", "Verification Failed", COLOR_ORANGE, text_lines=["• 2 Retries Exceeded", "• Schedules Human Callback"])
    draw_card(c, 555, 205, cw, ch, "collecting_details", "FNOL Collection", COLOR_GREEN, text_lines=["• Required Fields Gate", "• Conditional Injury Details"])
    
    draw_card(c, 80, 85, cw, ch, "clarifying", "Invalid Input", COLOR_BLUE, text_lines=["• Malformed Reg Plate", "• Prompts for Repetition"])
    draw_card(c, 555, 85, cw, ch, "recommending_services", "Service Entitlements", COLOR_GREEN, text_lines=["• Towing & Garage Offer", "• Policy Limit Checks"])
    
    draw_card(c, 318, 40, cw, ch, "completed", "Claim Persisted", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Sheet & Email Dispatched", "• Final Spoken Summary"])

    # State Transitions with clear labels
    draw_arrow(c, 318, 476, 235, 387, "Injuries / Severe", color=COLOR_RED)
    draw_arrow(c, 473, 476, 555, 387, "Safe / No Injuries", color=COLOR_GREEN)
    
    draw_arrow(c, 555, 356, 235, 267, "Attempts >= 2", color=COLOR_ORANGE)
    draw_arrow(c, 632, 325, 632, 267, "Verified Policy", color=COLOR_GREEN)
    
    draw_arrow(c, 555, 236, 235, 147, "Malformed Reg", color=COLOR_BLUE)
    draw_arrow(c, 632, 205, 632, 147, "Fields Complete", color=COLOR_GREEN)
    
    draw_arrow(c, 235, 116, 555, 236, "Reg Clarified", color=COLOR_GREEN)
    
    draw_arrow(c, 157, 325, 318, 71, "Close Call", color=COLOR_RED)
    draw_arrow(c, 157, 205, 318, 71, "Close Call", color=COLOR_ORANGE)
    draw_arrow(c, 632, 85, 473, 71, "Complete Claim", color=COLOR_GREEN)

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
