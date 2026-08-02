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

# 5 Canonical Role Colors
COLOR_GREY = colors.HexColor('#475569')      # 1. User / Client (Slate 600)
COLOR_BLUE = colors.HexColor('#2563eb')      # 2. Telephony Platform (Blue 600)
COLOR_GREEN = colors.HexColor('#059669')     # 3. Core Backend Container (Emerald 600)
COLOR_ORANGE = colors.HexColor('#d97706')    # 4. AI Engine (Amber 600)
COLOR_PURPLE = colors.HexColor('#7c3aed')    # 5. External Services (Violet 600)
COLOR_RED = colors.HexColor('#dc2626')       # Safety Alert / Emergency (Red 600)

# =============================================================================
# PRECISION GRAPHICS ENGINE (CLEAN HEADER & THICKER ARROWS)
# =============================================================================
def draw_header_footer(c, title, subtitle):
    # Sleek Header Bar
    c.setFillColor(COLOR_HEADER_BG)
    c.rect(0, 564, 792, 48, fill=True, stroke=False)
    
    # Title Left
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 12)
    c.drawString(25, 592, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT")
    
    # Clean Page Title Right (e.g. "1. SYSTEM CONTEXT")
    c.setFillColor(colors.HexColor('#38bdf8')) # Sky 400
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(767, 592, title.upper())
    
    # Subtitle Left
    c.setFillColor(colors.HexColor('#94a3b8')) # Slate 400
    c.setFont("Helvetica", 8.5)
    c.drawString(25, 574, subtitle)
    
    # Clean Footer Line
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(0.5)
    c.line(25, 24, 767, 24)
    
    # Footer Left
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(25, 12, "Meridian Motor Insurance — FNOL Voice Agent Architecture")

    # Legend at Bottom Right
    legend_x = 495
    legend_y = 12
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
    c.setLineWidth(1.4)
    if dashed_border:
        c.setDash(4, 3)
    c.roundRect(x, y, width, height, 4, fill=True, stroke=True)
    c.setDash()
    
    # Header bar inside card
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
    
    # Bullet lines (Pruned essentials)
    if text_lines:
        c.setFillColor(COLOR_TEXT_MAIN)
        c.setFont("Helvetica", 8)
        ly = y + height - 47
        for line in text_lines:
            c.drawString(x + 8, ly, line)
            ly -= 12

def draw_container_box(c, x, y, width, height, title, subtitle, color):
    c.setStrokeColor(color)
    c.setFillColor(COLOR_CONTAINER_BG)
    c.setLineWidth(1.4)
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

def draw_arrow(c, x1, y1, x2, y2, label="", dashed=False, color=COLOR_TEXT_MUTED, line_width=1.6):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(line_width)
    if dashed:
        c.setDash(4, 3)
    else:
        c.setDash()
    c.line(x1, y1, x2, y2)
    c.setDash()
    
    # Arrowhead calculation
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_size = 7
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
        ox = -math.sin(angle) * 7
        oy = math.cos(angle) * 7
        c.drawCentredString(mid_x + ox, mid_y + oy - 2.5, label)

# =============================================================================
# DIAGRAM 1: C4 SYSTEM CONTEXT & CONTAINER ARCHITECTURE
# =============================================================================
def render_diagram1(c):
    draw_header_footer(
        c, "1. System Context", 
        "High-level boundary, telephony gateway, backend container architecture, and external SaaS integrations"
    )
    
    # 1. External Clients
    draw_container_box(c, 25, 45, 145, 505, "1. CLIENTS & CALLERS", "Inbound Access", COLOR_GREY)
    draw_card(c, 35, 370, 125, 95, "PSTN Caller", "Phone Call", COLOR_GREY, text_lines=["• Inbound Audio Stream", "• Telephony Caller ID"])
    draw_card(c, 35, 210, 125, 95, "Browser Demo UI", "Web Client", COLOR_GREY, text_lines=["• WebRTC / WS Client", "• Live Event Streaming"])

    # 2. Voice Platform
    draw_container_box(c, 185, 45, 155, 505, "2. VOICE PLATFORM", "Retell AI Telephony", COLOR_BLUE)
    draw_card(c, 195, 290, 135, 150, "Retell AI Engine", "Custom LLM Agent", COLOR_BLUE, text_lines=["• STT / TTS Audio Pipeline", "• Barge-In Interruption", "• Agent: agent_e907d3...", "• WebSocket Transport"])

    # 3. Core Railway Cloud Container Boundary
    draw_container_box(c, 355, 45, 260, 505, "3. BACKEND CONTAINER", "Railway Cloud | Port 3000", COLOR_GREEN)
    
    draw_card(c, 375, 440, 220, 75, "Express & WS Server", "server.ts", COLOR_GREEN, text_lines=["• HTTP / WS Server (Port 3000)", "• Session State Mapping"])
    draw_card(c, 375, 345, 220, 80, "ConversationManager", "Core Orchestrator", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• FSM State Machine Engine", "• Policy & Field Guardrails"])
    draw_card(c, 375, 250, 220, 80, "LLM Extraction Service", "extractClaimData.ts", COLOR_GREEN, text_lines=["• Native SSE Stream Parser", "• Out-of-Order Slot Capture"])
    draw_card(c, 375, 155, 220, 80, "Claim Logger & Outbox", "claimLogger.ts", COLOR_GREEN, text_lines=["• Multi-Logger Orchestrator", "• Local JSON Outbox Backup"])
    draw_card(c, 375, 65, 220, 75, "Notification Service", "notificationService.ts", COLOR_GREEN, text_lines=["• Resend REST Email SDK", "• HTML Email Formatting"])

    # 4. External Services
    draw_container_box(c, 630, 45, 140, 505, "4. SAAS APIS", "External Integrations", COLOR_PURPLE)
    draw_card(c, 640, 410, 120, 95, "Gemini 2.5 Flash", "Primary AI Engine", COLOR_ORANGE, text_lines=["• Native SSE REST API", "• <700ms TTFT Latency"])
    draw_card(c, 640, 250, 120, 95, "Google Sheets API", "Structured DB", COLOR_PURPLE, text_lines=["• Sheet v4 REST API", "• Auto Header Formatting"])
    draw_card(c, 640, 90, 120, 95, "Resend Email API", "Transactional Mail", COLOR_PURPLE, text_lines=["• REST API (v3)", "• Verified Domain Sender"])

    # Connectors with thicker 1.6 lines
    draw_arrow(c, 160, 417, 195, 380, "Voice", line_width=1.6)
    draw_arrow(c, 160, 257, 195, 340, "WSS", line_width=1.6)
    
    draw_arrow(c, 330, 365, 375, 477, "WSS Connect", line_width=1.6)
    draw_arrow(c, 485, 440, 485, 425, line_width=1.6)
    draw_arrow(c, 485, 345, 485, 330, line_width=1.6)
    draw_arrow(c, 485, 250, 485, 235, line_width=1.6)
    draw_arrow(c, 485, 155, 485, 140, line_width=1.6)

    draw_arrow(c, 595, 290, 640, 457, "HTTPS SSE", False, COLOR_ORANGE, line_width=1.6)
    draw_arrow(c, 595, 195, 640, 297, "Async Log", True, COLOR_PURPLE, line_width=1.6)
    draw_arrow(c, 595, 102, 640, 137, "Async Mail", True, COLOR_PURPLE, line_width=1.6)

# =============================================================================
# DIAGRAM 2: C4 COMPONENT ARCHITECTURE (CONVERSATION MANAGER)
# =============================================================================
def render_diagram2(c):
    draw_header_footer(
        c, "2. Component Architecture", 
        "Decoupled service components executing turn validation, policy lookup, extraction, and recommendations"
    )
    
    # Central Orchestrator Top (Increased vertical whitespace)
    draw_card(c, 276, 440, 240, 80, "ConversationManager", "src/conversation/ConversationManager.ts", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Turn Orchestrator & Action Dispatcher", "• FSM State Machine Engine", "• Session History & Slot Tracking"])

    # 4 Core Processing Components (Top Row)
    draw_card(c, 25, 265, 170, 120, "VerifyPolicyService", "verifyPolicy.ts", COLOR_GREEN, text_lines=["• Validates Policy # & Name", "• Reads policies.json DB", "• Enforces 2-Retry Limit", "• Offers Callback on Fail"])
    
    draw_card(c, 215, 265, 170, 120, "ExtractClaimDataService", "extractClaimData.ts", COLOR_GREEN, text_lines=["• Prompts Gemini 2.5 SSE", "• Fallback Regex Matcher", "• JSON Slot Sanitizer", "• Token Usage Tracking"])

    draw_card(c, 405, 265, 170, 120, "NormalizeClaimData", "normalizeClaimData.ts", COLOR_GREEN, text_lines=["• Spoken Phonetic Cleaner", "• License Plate Normalizer", "• Relative Date Parser", "• Vehicle Details Cleaner"])

    draw_card(c, 595, 265, 170, 120, "RecommendServices", "recommendServices.ts", COLOR_GREEN, text_lines=["• Checks Entitlements", "• Towing Recommendations", "• Garage Recommendations", "• Out-of-Pocket Rules"])

    # 4 Output & Persistence Components (Bottom Row)
    draw_card(c, 25, 75, 170, 120, "GenerateSummaryService", "generateSummary.ts", COLOR_GREEN, text_lines=["• Synthesizes Claim Summary", "• Classifies Severity Level", "• Summarizes Incidents", "• Formats Output Payload"])

    draw_card(c, 215, 75, 170, 120, "ClaimLoggerService", "googleSheets.ts", COLOR_GREEN, text_lines=["• Appends Rows to Sheet", "• Auto-Formats Headers", "• Handles Google Auth", "• Writes Local JSON Outbox"])

    draw_card(c, 405, 75, 170, 120, "NotificationService", "notificationService.ts", COLOR_GREEN, text_lines=["• Sends Resend Emails", "• HTML Email Formatting", "• Priority Urgent Badges", "• Sandbox Mode Fallback"])

    draw_card(c, 595, 75, 170, 120, "EmpathyEngine", "EmpathyEngine.ts", COLOR_GREEN, text_lines=["• Distress Phrase Detector", "• Warm Spoken Openers", "• Calming Response Rules", "• Compliance Tone Check"])

    # Connectors from Orchestrator down to components
    top_targets = [110, 300, 490, 680]
    for tx in top_targets:
        draw_arrow(c, 396, 440, tx, 385, "Invokes", line_width=1.6)
        draw_arrow(c, tx, 265, tx, 195, "Flows to", line_width=1.6)

# =============================================================================
# DIAGRAM 3: UML SEQUENCE FLOW & ASYNC PERSISTENCE
# =============================================================================
def render_diagram3(c):
    draw_header_footer(
        c, "3. Runtime Sequence", 
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
        draw_arrow(c, x1, y, x2, y, text, async_call, COLOR_PURPLE if async_call else COLOR_TEXT_MAIN, line_width=1.7)

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
    
    # Highly Obvious Darker Purple Async Container Box
    c.setStrokeColor(COLOR_PURPLE)
    c.setFillColor(colors.HexColor('#ede9fe')) # High contrast light violet
    c.setLineWidth(1.6)
    c.setDash(4, 3)
    c.roundRect(415, y - 60, 360, 85, 4, fill=True, stroke=True)
    c.setDash()
    
    c.setFillColor(COLOR_PURPLE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(425, y + 12, "BACKGROUND TASKS (NON-BLOCKING ASYNC I/O)")
    
    seq_msg(475, 735, y - 10, "11. Promise.resolve -> Google Sheets API", True); y -= 33
    seq_msg(475, 735, y - 10, "12. Promise.resolve -> Resend Email API", True)

# =============================================================================
# DIAGRAM 4: FINITE STATE MACHINE (FSM) & COMPLIANCE ENGINE
# =============================================================================
def render_diagram4(c):
    draw_header_footer(
        c, "4. Finite State Machine", 
        "100% deterministic safety guardrails, policy verification limits, field collection, and completion gates"
    )
    
    cw, ch = 155, 62
    
    # State Nodes Layout with distinct path colors
    draw_card(c, 318, 445, cw, ch, "safety_check", "Initial Greeting", COLOR_BLUE, text_lines=["• Asks if everyone is safe", "• Scans for severe crash"])
    
    # Emergency Path (Red)
    draw_card(c, 80, 325, cw, ch, "escalation", "Emergency Alert", COLOR_RED, colors.HexColor('#fef2f2'), text_lines=["• High Severity Flagged", "• Advises 911 / Emergency"])
    
    # Happy Path (Green)
    draw_card(c, 555, 325, cw, ch, "verification", "Policy Lookup", COLOR_GREEN, colors.HexColor('#f0fdf4'), text_lines=["• Policy # + Name Check", "• DB Lookup in policies.json"])
    
    # Failure / Retry Path (Orange / Blue)
    draw_card(c, 80, 205, cw, ch, "callback_offer", "Verification Failed", COLOR_ORANGE, colors.HexColor('#fffbeb'), text_lines=["• 2 Retries Exceeded", "• Schedules Human Callback"])
    draw_card(c, 555, 205, cw, ch, "collecting_details", "FNOL Collection", COLOR_GREEN, colors.HexColor('#f0fdf4'), text_lines=["• Required Fields Gate", "• Conditional Injury Details"])
    
    draw_card(c, 80, 85, cw, ch, "clarifying", "Invalid Input", COLOR_BLUE, text_lines=["• Malformed Reg Plate", "• Prompts for Repetition"])
    draw_card(c, 555, 85, cw, ch, "recommending_services", "Service Entitlements", COLOR_GREEN, colors.HexColor('#f0fdf4'), text_lines=["• Towing & Garage Offer", "• Policy Limit Checks"])
    
    # Final Happy Completion Node (Bright Emerald Green)
    draw_card(c, 318, 40, cw, ch, "completed", "Claim Persisted", COLOR_GREEN, colors.HexColor('#dcfce7'), text_lines=["• Sheet & Email Dispatched", "• Final Spoken Summary"])

    # Thicker colored transition arrows (1.7px line width)
    draw_arrow(c, 318, 476, 235, 387, "Injuries / Severe", color=COLOR_RED, line_width=1.7)
    draw_arrow(c, 473, 476, 555, 387, "Safe / No Injuries", color=COLOR_GREEN, line_width=1.7)
    
    draw_arrow(c, 555, 356, 235, 267, "Attempts >= 2", color=COLOR_ORANGE, line_width=1.7)
    draw_arrow(c, 632, 325, 632, 267, "Verified Policy", color=COLOR_GREEN, line_width=1.7)
    
    draw_arrow(c, 555, 236, 235, 147, "Malformed Reg", color=COLOR_BLUE, line_width=1.7)
    draw_arrow(c, 632, 205, 632, 147, "Fields Complete", color=COLOR_GREEN, line_width=1.7)
    
    draw_arrow(c, 235, 116, 555, 236, "Reg Clarified", color=COLOR_GREEN, line_width=1.7)
    
    draw_arrow(c, 157, 325, 318, 71, "Close Call", color=COLOR_RED, line_width=1.7)
    draw_arrow(c, 157, 205, 318, 71, "Close Call", color=COLOR_ORANGE, line_width=1.7)
    draw_arrow(c, 632, 85, 473, 71, "Complete Claim", color=COLOR_GREEN, line_width=1.7)

# =============================================================================
# MAIN BUILD PIPELINE
# =============================================================================
def build_all_artifacts():
    pdf_path = os.path.join(BASE_DIR, 'Architecture.pdf')
    png_path = os.path.join(BASE_DIR, 'Architecture.png')
    
    c = canvas.Canvas(pdf_path, pagesize=landscape(letter))
    
    for page_fn in [render_diagram1, render_diagram2, render_diagram3, render_diagram4]:
        page_fn(c)
        c.showPage()
        
    c.save()
    print(f"✅ Generated 4-Page PDF: {pdf_path}")

    # High-Res PNG (Page 1 preview) at 300 DPI
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    pix.save(png_path)
    print(f"✅ Rendered 300 DPI high-res PNG preview: {png_path}")

if __name__ == '__main__':
    build_all_artifacts()
