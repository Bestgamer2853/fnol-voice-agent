import os
import math
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# COLOR PALETTE (Stripe / OpenAI / Modern Tech Style)
COLOR_BG = colors.HexColor('#ffffff')
COLOR_HEADER_BG = colors.HexColor('#0a1128')  # Deep dark slate for headers
COLOR_TEXT_MAIN = colors.HexColor('#1e293b')
COLOR_TEXT_MUTED = colors.HexColor('#64748b')
COLOR_BORDER = colors.HexColor('#cbd5e1')

COLOR_GREY = colors.HexColor('#475569')      # User / Customer
COLOR_BLUE = colors.HexColor('#2563eb')      # Platform / Voice Gateway (Retell)
COLOR_GREEN = colors.HexColor('#059669')     # Backend / Core (Railway, Express, FSM)
COLOR_ORANGE = colors.HexColor('#d97706')    # AI / Model Services (Gemini)
COLOR_PURPLE = colors.HexColor('#7c3aed')    # External Services (Sheets, Resend)
COLOR_RED = colors.HexColor('#dc2626')       # Escalation / Emergency

def draw_header_footer(c, page_num, title, subtitle):
    # Header Bar
    c.setFillColor(COLOR_HEADER_BG)
    c.rect(0, 560, 792, 52, fill=True, stroke=False)
    
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 14)
    c.drawString(30, 580, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE")
    
    c.setFillColor(colors.HexColor('#94a3b8'))
    c.setFont("Helvetica", 9)
    c.drawRightString(762, 580, f"DIAGRAM {page_num} OF 7: {title.upper()}")
    
    # Subtitle bar
    c.setFillColor(colors.HexColor('#f8fafc'))
    c.rect(0, 535, 792, 25, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(30, 543, subtitle)
    
    # Footer Bar
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(0.5)
    c.line(30, 30, 762, 30)
    
    c.setFillColor(COLOR_TEXT_MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(30, 18, "Version: v1.0.0  |  Author: Principal Solutions Architect  |  System Target: Meridian FNOL Voice Agent")
    c.drawRightString(762, 18, f"Page {page_num} of 7")

    # Legend at bottom right
    legend_x = 520
    legend_y = 18
    
    items = [
        ("User", COLOR_GREY),
        ("Platform", COLOR_BLUE),
        ("Backend", COLOR_GREEN),
        ("AI Engine", COLOR_ORANGE),
        ("External API", COLOR_PURPLE)
    ]
    
    for text, color in items:
        c.setFillColor(color)
        c.rect(legend_x, legend_y - 2, 8, 8, fill=True, stroke=False)
        c.setFillColor(COLOR_TEXT_MAIN)
        c.drawString(legend_x + 11, legend_y, text)
        legend_x += 48

def draw_arrow(c, x1, y1, x2, y2, label="", dashed=False, color=COLOR_TEXT_MUTED):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(1.5)
    if dashed:
        c.setDash(4, 3)
    else:
        c.setDash()
    c.line(x1, y1, x2, y2)
    c.setDash()
    
    # Arrowhead
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
        c.setFont("Helvetica-Oblique", 8)
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        ox = -math.sin(angle) * 6
        oy = math.cos(angle) * 6
        c.drawCentredString(mid_x + ox, mid_y + oy - 3, label)

def draw_card(c, x, y, width, height, title, subtitle, color, fill_color=colors.HexColor('#ffffff'), text_lines=None, dashed_border=False):
    # Card Border
    c.setStrokeColor(color)
    c.setFillColor(fill_color)
    c.setLineWidth(1.2)
    if dashed_border:
        c.setDash(4, 3)
    c.roundRect(x, y, width, height, 4, fill=True, stroke=True)
    c.setDash()
    
    # Colored Top Bar
    c.setFillColor(color)
    c.roundRect(x, y + height - 24, width, 24, 4, fill=True, stroke=False)
    # square the bottom of the rounded rect
    c.rect(x, y + height - 24, width, 4, fill=True, stroke=False)
    
    # Title
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 10, y + height - 16, title)
    
    # Subtitle
    if subtitle:
        c.setFillColor(COLOR_TEXT_MUTED)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x + 10, y + height - 40, subtitle)
    
    if text_lines:
        c.setFillColor(COLOR_TEXT_MAIN)
        c.setFont("Helvetica", 8)
        ly = y + height - 56
        for line in text_lines:
            c.drawString(x + 10, ly, line)
            ly -= 12

def draw_container_box(c, x, y, width, height, title, color):
    c.setStrokeColor(color)
    c.setFillColor(colors.HexColor('#f8fafc'))
    c.setLineWidth(1.5)
    c.setDash(4, 4)
    c.roundRect(x, y, width, height, 8, fill=True, stroke=True)
    c.setDash()
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 12, y + height - 16, title)

# -----------------------------------------------------------------------------
# PAGE 1: SYSTEM CONTEXT DIAGRAM (C1)
# -----------------------------------------------------------------------------
def render_page1(c):
    draw_header_footer(c, 1, "System Context Diagram (C4 Level 1)", "High-level entry points, core boundary, and external integration points")
    
    # Coordinates for boxes
    y_center = 260
    c_w, c_h = 160, 80
    
    # 1. Customer
    draw_card(c, 40, y_center, c_w, c_h, "Caller / Customer", "PSTN Phone / Browser UI", COLOR_GREY)
    
    # 2. Retell AI
    draw_card(c, 260, y_center, c_w, c_h, "Retell AI Platform", "Voice Gateway & STT/TTS", COLOR_BLUE)
    
    # 3. FNOL Voice Agent (System Boundary)
    draw_card(c, 480, y_center, c_w, c_h, "FNOL Voice Agent", "Railway Node.js Engine", COLOR_GREEN, colors.HexColor('#f0fdf4'))
    
    # 4. External Services (Stacked)
    draw_card(c, 480, y_center + 140, c_w, c_h, "Gemini 2.5 Flash Lite", "Primary Extraction SSE", COLOR_ORANGE)
    draw_card(c, 480, y_center - 140, c_w, c_h, "Google Sheets API", "Structured Claims DB", COLOR_PURPLE)
    draw_card(c, 260, y_center - 140, c_w, c_h, "Resend REST API", "Transactional Emails", COLOR_PURPLE)
    
    # Connectors
    draw_arrow(c, 200, y_center + 40, 260, y_center + 40, "Voice stream", False, COLOR_GREY)
    draw_arrow(c, 420, y_center + 40, 480, y_center + 40, "WSS Audio & Events", False, COLOR_BLUE)
    draw_arrow(c, 560, y_center + 80, 560, y_center + 140, "HTTPS SSE Stream", False, COLOR_ORANGE)
    draw_arrow(c, 560, y_center, 560, y_center - 60, "Async Logging", True, COLOR_PURPLE)
    draw_arrow(c, 480, y_center - 100, 420, y_center - 100, "Async Mail dispatch", True, COLOR_PURPLE)


# -----------------------------------------------------------------------------
# PAGE 2: CONTAINER DIAGRAM (C2)
# -----------------------------------------------------------------------------
def render_page2(c):
    draw_header_footer(c, 2, "Container Diagram (C4 Level 2)", "Subsystem containers inside the FNOL Voice Agent deployment boundary")
    
    # External Clients
    draw_card(c, 30, 280, 140, 70, "Retell Telephony", "WSS Client Gateway", COLOR_BLUE)
    
    # Railway Container Boundary
    draw_container_box(c, 210, 80, 390, 400, "RAILWAY CLOUD CONTAINER (Node.js ESM)", COLOR_GREEN)
    
    # Inner Containers
    draw_card(c, 230, 370, 160, 70, "Express Server & WS", "server.ts (Port 3000)", COLOR_GREEN)
    draw_card(c, 420, 370, 160, 70, "ConversationManager", "Core Orchestration", COLOR_GREEN, colors.HexColor('#dcfce7'))
    
    draw_card(c, 230, 280, 160, 70, "State Machine", "ConversationState.ts", COLOR_GREEN)
    draw_card(c, 420, 280, 160, 70, "LLM Extraction", "extractClaimData.ts", COLOR_GREEN)
    
    draw_card(c, 230, 190, 160, 70, "Claim Logger", "claimLogger.ts", COLOR_GREEN)
    draw_card(c, 420, 190, 160, 70, "Notification Service", "notificationService.ts", COLOR_GREEN)
    
    draw_card(c, 230, 100, 350, 60, "Environment Configurations", "policies.json, requiredFields.ts", COLOR_GREEN)

    # External Integrations
    draw_card(c, 640, 370, 130, 70, "Gemini 2.5 API", "REST / SSE", COLOR_ORANGE)
    draw_card(c, 640, 280, 130, 70, "Google Sheets", "v4 REST API", COLOR_PURPLE)
    draw_card(c, 640, 190, 130, 70, "Resend Email", "REST SDK", COLOR_PURPLE)

    # Arrows
    draw_arrow(c, 170, 315, 230, 385, "WebSocket", False, COLOR_BLUE)
    draw_arrow(c, 390, 405, 420, 405, "Delegates")
    draw_arrow(c, 450, 370, 450, 350)
    draw_arrow(c, 500, 370, 500, 350)
    draw_arrow(c, 450, 280, 450, 260)
    draw_arrow(c, 500, 280, 500, 260)
    
    draw_arrow(c, 580, 405, 640, 405, "LLM Calls", False, COLOR_ORANGE)
    draw_arrow(c, 580, 315, 640, 315, "Sheets API", True, COLOR_PURPLE)
    draw_arrow(c, 580, 225, 640, 225, "Email SDK", True, COLOR_PURPLE)

# -----------------------------------------------------------------------------
# PAGE 3: COMPONENT DIAGRAM (C3)
# -----------------------------------------------------------------------------
def render_page3(c):
    draw_header_footer(c, 3, "Component Diagram (C4 Level 3)", "Modular services composing the ConversationManager domain orchestration engine")
    
    # Core Orchestrator Box
    draw_card(c, 296, 390, 200, 70, "ConversationManager", "Core Orchestration", COLOR_GREEN, colors.HexColor('#dcfce7'))
    
    # Components Grid (4x2)
    cw, ch = 150, 70
    draw_card(c, 50, 260, cw, ch, "VerifyPolicyService", "verifyPolicy.ts", COLOR_GREEN)
    draw_card(c, 230, 260, cw, ch, "ExtractClaimData", "extractClaimData.ts", COLOR_GREEN)
    draw_card(c, 410, 260, cw, ch, "NormalizeClaimData", "normalizeClaimData.ts", COLOR_GREEN)
    draw_card(c, 590, 260, cw, ch, "RecommendServices", "recommendServices.ts", COLOR_GREEN)
    
    draw_card(c, 50, 150, cw, ch, "GenerateSummary", "generateSummary.ts", COLOR_GREEN)
    draw_card(c, 230, 150, cw, ch, "ClaimLogger", "claimLogger.ts", COLOR_GREEN)
    draw_card(c, 410, 150, cw, ch, "NotificationService", "notificationService.ts", COLOR_GREEN)
    draw_card(c, 590, 150, cw, ch, "EmpathyEngine", "EmpathyEngine.ts", COLOR_GREEN)

    # Dependencies Line
    for px in [125, 305, 485, 665]:
        draw_arrow(c, 396, 390, px, 330)
        draw_arrow(c, px, 260, px, 220)

# -----------------------------------------------------------------------------
# PAGE 4: SEQUENCE DIAGRAM
# -----------------------------------------------------------------------------
def render_page4(c):
    draw_header_footer(c, 4, "UML Request Sequence Diagram", "Synchronous voice interaction flow & non-blocking asynchronous persistence dispatch")
    
    lifelines = [
        ("Caller", 80, COLOR_GREY),
        ("Retell AI", 200, COLOR_BLUE),
        ("Railway Server", 340, COLOR_GREEN),
        ("Conv Manager", 480, COLOR_GREEN),
        ("Gemini API", 620, COLOR_ORANGE),
        ("Sheets & Resend", 730, COLOR_PURPLE)
    ]
    
    for name, lx, color in lifelines:
        # Box
        c.setFillColor(color)
        c.roundRect(lx - 45, 480, 90, 28, 4, fill=True, stroke=False)
        c.setFillColor(colors.HexColor('#ffffff'))
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(lx, 492, name)
        # Line
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(1)
        c.setDash(4, 4)
        c.line(lx, 480, lx, 60)
        c.setDash()

    # Sequence Messages
    def seq_msg(x1, x2, y, text, async_call=False):
        draw_arrow(c, x1, y, x2, y, text, async_call, COLOR_PURPLE if async_call else COLOR_TEXT_MAIN)

    y = 440
    seq_msg(80, 200, y, "1. Initiate Phone Call"); y -= 35
    seq_msg(200, 340, y, "2. WS Connect & call_details"); y -= 35
    seq_msg(340, 200, y, "3. Greeting (\"Are you safe?\")"); y -= 35
    seq_msg(80, 200, y, "4. \"Yes safe. Policy MMI-10234 Arjun.\""); y -= 35
    seq_msg(200, 340, y, "5. response_required"); y -= 35
    seq_msg(340, 480, y, "6. handleUserMessage()"); y -= 35
    seq_msg(480, 620, y, "7. extract() [SSE Stream]"); y -= 35
    seq_msg(620, 480, y, "8. Extracted Slots + Natural Response"); y -= 35
    seq_msg(480, 340, y, "9. Verified Policy & Content"); y -= 35
    seq_msg(340, 200, y, "10. response { content }"); y -= 45
    
    # Async Block highlight
    c.setStrokeColor(COLOR_PURPLE)
    c.setFillColor(colors.HexColor('#f3e8ff'))
    c.setLineWidth(1.5)
    c.setDash(4, 3)
    c.roundRect(420, y - 50, 360, 75, 4, fill=True, stroke=True)
    c.setDash()
    c.setFillColor(COLOR_PURPLE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(425, y + 10, "NON-BLOCKING ASYNC PERSISTENCE")
    
    seq_msg(480, 730, y - 10, "11. log() -> Append Sheet Row", True); y -= 35
    seq_msg(480, 730, y - 10, "12. sendMail() -> Email Output", True)

# -----------------------------------------------------------------------------
# PAGE 5: FINITE STATE MACHINE (FSM)
# -----------------------------------------------------------------------------
def render_page5(c):
    draw_header_footer(c, 5, "Claim Finite State Machine (FSM)", "Deterministic state transitions, retry limits, escalation paths, and completion gates")
    
    cw, ch = 150, 50
    # State Nodes
    draw_card(c, 321, 410, cw, ch, "safety_check", "Initial Greeting", COLOR_BLUE)
    draw_card(c, 100, 310, cw, ch, "escalation", "Urgent Incident Alert", COLOR_RED, colors.HexColor('#fef2f2'))
    draw_card(c, 542, 310, cw, ch, "verification", "Policy & Name Lookup", COLOR_GREEN)
    
    draw_card(c, 100, 210, cw, ch, "callback_offer", "2 Verif Failures", COLOR_ORANGE)
    draw_card(c, 542, 210, cw, ch, "collecting_details", "FNOL Fields Collection", COLOR_GREEN)
    
    draw_card(c, 100, 110, cw, ch, "clarifying", "Invalid Reg Input", COLOR_BLUE)
    draw_card(c, 542, 110, cw, ch, "recommending", "Towing / Garage", COLOR_GREEN)
    
    draw_card(c, 321, 40, cw, ch, "completed", "Claim Logged", COLOR_GREEN, colors.HexColor('#dcfce7'))

    # Transitions
    draw_arrow(c, 321, 435, 250, 360, "Injury", color=COLOR_RED)
    draw_arrow(c, 471, 435, 542, 360, "Safe", color=COLOR_GREEN)
    
    draw_arrow(c, 542, 335, 250, 260, "Attempts >= 2", color=COLOR_ORANGE)
    draw_arrow(c, 617, 310, 617, 260, "Verified", color=COLOR_GREEN)
    
    draw_arrow(c, 542, 235, 250, 160, "Malformed", color=COLOR_BLUE)
    draw_arrow(c, 617, 210, 617, 160, "All Fields Done", color=COLOR_GREEN)
    
    draw_arrow(c, 175, 160, 542, 235, "Clarified", color=COLOR_GREEN)
    
    draw_arrow(c, 175, 310, 321, 65, "End", color=COLOR_GREEN)
    draw_arrow(c, 175, 210, 321, 65, "End", color=COLOR_GREEN)
    draw_arrow(c, 617, 110, 471, 65, "End", color=COLOR_GREEN)

# -----------------------------------------------------------------------------
# PAGE 6: DEPLOYMENT DIAGRAM
# -----------------------------------------------------------------------------
def render_page6(c):
    draw_header_footer(c, 6, "Deployment Topology & Trust Boundaries", "Infrastructure nodes, container boundaries, and external API gateways")
    
    draw_container_box(c, 40, 100, 160, 360, "CLIENT TIER", COLOR_GREY)
    draw_card(c, 60, 280, 120, 80, "User Environment", "PSTN / Browser", COLOR_GREY)
    
    draw_container_box(c, 240, 100, 160, 360, "TELEPHONY TIER", COLOR_BLUE)
    draw_card(c, 260, 280, 120, 80, "Retell Cloud", "agent_e907d3...", COLOR_BLUE)
    
    draw_container_box(c, 440, 100, 160, 360, "APP PLATFORM TIER", COLOR_GREEN)
    draw_card(c, 460, 280, 120, 80, "Railway Container", "Node.js Port 3000", COLOR_GREEN)
    draw_card(c, 460, 160, 120, 80, "Env Config", "Secrets Vault", COLOR_GREEN, dashed_border=True)
    
    draw_container_box(c, 640, 100, 120, 360, "EXTERNAL SAAS TIER", COLOR_PURPLE)
    draw_card(c, 645, 330, 110, 70, "Google Gemini", "SSE Gateway", COLOR_ORANGE)
    draw_card(c, 645, 230, 110, 70, "Google Sheets", "v4 REST API", COLOR_PURPLE)
    draw_card(c, 645, 130, 110, 70, "Resend System", "REST API", COLOR_PURPLE)

    draw_arrow(c, 180, 320, 260, 320, "Voice")
    draw_arrow(c, 380, 320, 460, 320, "WSS")
    draw_arrow(c, 460, 180, 460, 280)
    
    draw_arrow(c, 580, 350, 645, 350)
    draw_arrow(c, 580, 260, 645, 260)
    draw_arrow(c, 580, 160, 645, 160)

# -----------------------------------------------------------------------------
# PAGE 7: DATA FLOW DIAGRAM
# -----------------------------------------------------------------------------
def render_page7(c):
    draw_header_footer(c, 7, "Data Flow & Transformation Pipeline", "Data schema transformations from raw audio to persistent records")
    
    steps = [
        ("1. Spoken Audio", "Caller Voice Input", COLOR_GREY),
        ("2. Raw Transcript", "Retell STT Engine", COLOR_BLUE),
        ("3. JSON Extraction", "Gemini 2.5 Flash Lite", COLOR_ORANGE),
        ("4. Claim Patch", "normalizeClaimData.ts", COLOR_GREEN),
        ("5. State Merge", "ConversationState", COLOR_GREEN),
        ("6. Summary Gen", "generateSummary.ts", COLOR_GREEN),
        ("7. Sheets Record", "Structured Google Row", COLOR_PURPLE),
        ("8. Email Payload", "Resend API Format", COLOR_PURPLE),
        ("9. Claim Completed", "Workflow Finished", COLOR_GREEN)
    ]
    
    # 3x3 Grid
    coords = [
        (50, 360), (310, 360), (570, 360),
        (50, 220), (310, 220), (570, 220),
        (50, 80),  (310, 80),  (570, 80)
    ]
    
    for idx, (title, desc, color) in enumerate(steps):
        gx, gy = coords[idx]
        draw_card(c, gx, gy, 170, 70, title, desc, color)
        
        if idx in [0, 1, 3, 4, 6, 7]:
            draw_arrow(c, gx + 170, gy + 35, gx + 260, gy + 35)
        elif idx in [2, 5]:
            draw_arrow(c, gx + 85, gy, gx + 85, gy - 70)

# -----------------------------------------------------------------------------
# MAIN GENERATOR
# -----------------------------------------------------------------------------
def build_all_artifacts():
    pdf_path = os.path.join(BASE_DIR, 'Architecture.pdf')
    png_path = os.path.join(BASE_DIR, 'Architecture.png')
    
    c = canvas.Canvas(pdf_path, pagesize=landscape(letter))
    for page_fn in [render_page1, render_page2, render_page3, render_page4, render_page5, render_page6, render_page7]:
        page_fn(c)
        c.showPage()
    c.save()
    print(f"✅ Generated 7-page PDF: {pdf_path}")

    # High-Res PNG (Page 1 preview)
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(dpi=300)
    pix.save(png_path)
    print(f"✅ Rendered high-res PNG preview: {png_path}")

if __name__ == '__main__':
    build_all_artifacts()
