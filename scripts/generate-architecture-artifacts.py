import os
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.lib import colors

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# COLOR PALETTE (C4 / Modern Architectural Standard)
COLOR_BG = colors.HexColor('#ffffff')
COLOR_HEADER_BG = colors.HexColor('#0f172a')
COLOR_TEXT_MAIN = colors.HexColor('#0f172a')
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
    c.drawString(30, 588, "MERIDIAN MOTOR INSURANCE — FNOL VOICE AGENT ARCHITECTURE")
    
    c.setFillColor(colors.HexColor('#94a3b8'))
    c.setFont("Helvetica", 9)
    c.drawRightString(762, 588, f"DIAGRAM {page_num} OF 7: {title.upper()}")
    
    # Subtitle bar
    c.setFillColor(colors.HexColor('#f1f5f9'))
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

    # Draw Legend at bottom right
    legend_x = 520
    legend_y = 38
    c.setFont("Helvetica-Bold", 7)
    
    c.setFillColor(COLOR_GREY); c.rect(legend_x, legend_y, 8, 8, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MAIN); c.drawString(legend_x + 11, legend_y + 1, "User")
    
    c.setFillColor(COLOR_BLUE); c.rect(legend_x + 45, legend_y, 8, 8, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MAIN); c.drawString(legend_x + 56, legend_y + 1, "Platform")
    
    c.setFillColor(COLOR_GREEN); c.rect(legend_x + 100, legend_y, 8, 8, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MAIN); c.drawString(legend_x + 111, legend_y + 1, "Backend")
    
    c.setFillColor(COLOR_ORANGE); c.rect(legend_x + 155, legend_y, 8, 8, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MAIN); c.drawString(legend_x + 166, legend_y + 1, "AI Engine")
    
    c.setFillColor(COLOR_PURPLE); c.rect(legend_x + 205, legend_y, 8, 8, fill=True, stroke=False)
    c.setFillColor(COLOR_TEXT_MAIN); c.drawString(legend_x + 216, legend_y + 1, "External API")

def draw_card(c, x, y, width, height, title, subtitle, color, fill_color=colors.HexColor('#ffffff')):
    c.setStrokeColor(color)
    c.setFillColor(fill_color)
    c.setLineWidth(1.5)
    c.roundRect(x, y, width, height, 6, fill=True, stroke=True)
    
    # Title Bar
    c.setFillColor(color)
    c.rect(x, y + height - 22, width, 22, fill=True, stroke=False)
    c.setFillColor(colors.HexColor('#ffffff'))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(x + 8, y + height - 15, title)
    
    if subtitle:
        c.setFillColor(COLOR_TEXT_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 8, y + 10, subtitle)

# -----------------------------------------------------------------------------
# PAGE 1: SYSTEM CONTEXT DIAGRAM (C1)
# -----------------------------------------------------------------------------
def render_page1(c):
    draw_header_footer(c, 1, "System Context Diagram (C4 Level 1)", "High-level entry points, core boundary, and external integration points (<10 sec comprehension)")
    
    # 1. Customer
    draw_card(c, 50, 260, 140, 100, "Caller / Customer", "PSTN Phone / Browser UI", COLOR_GREY)
    
    # 2. Retell AI
    draw_card(c, 230, 260, 140, 100, "Retell AI Platform", "Voice Gateway & STT/TTS", COLOR_BLUE)
    
    # 3. FNOL Voice Agent (System Boundary)
    draw_card(c, 410, 210, 160, 200, "FNOL Voice Agent", "Railway Node.js Engine", COLOR_GREEN, colors.HexColor('#f0fdf4'))
    
    # 4. External Services (Stacked)
    draw_card(c, 610, 350, 140, 70, "Gemini 2.5 Flash Lite", "Primary Extraction SSE", COLOR_ORANGE)
    draw_card(c, 610, 250, 140, 70, "Google Sheets API", "Structured Claims DB", COLOR_PURPLE)
    draw_card(c, 610, 150, 140, 70, "Resend REST API", "Transactional Emails", COLOR_PURPLE)
    
    # Connectors & Arrows
    c.setStrokeColor(COLOR_TEXT_MAIN)
    c.setLineWidth(1.5)
    
    # Caller -> Retell
    c.line(190, 310, 230, 310)
    c.drawString(195, 315, "Voice")
    
    # Retell -> FNOL Backend
    c.line(370, 310, 410, 310)
    c.drawString(375, 315, "WSS")
    
    # Backend -> Gemini
    c.line(570, 350, 610, 385)
    c.drawString(572, 372, "HTTPS SSE")
    
    # Backend -> Sheets
    c.line(570, 310, 610, 285)
    c.drawString(572, 302, "Async Log")
    
    # Backend -> Resend
    c.line(570, 270, 610, 185)
    c.drawString(572, 220, "Async Mail")

# -----------------------------------------------------------------------------
# PAGE 2: CONTAINER DIAGRAM (C2)
# -----------------------------------------------------------------------------
def render_page2(c):
    draw_header_footer(c, 2, "Container Diagram (C4 Level 2)", "Subsystem containers inside the FNOL Voice Agent Railway deployment boundary")
    
    # External Clients
    draw_card(c, 40, 270, 120, 90, "Retell AI Telephony", "WSS Client Gateway", COLOR_BLUE)
    
    # Railway Container Boundary
    c.setStrokeColor(COLOR_GREEN)
    c.setFillColor(colors.HexColor('#f0fdf4'))
    c.setLineWidth(1.5)
    c.roundRect(190, 110, 430, 390, 10, fill=True, stroke=True)
    c.setFillColor(COLOR_GREEN)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(205, 482, "RAILWAY CLOUD CONTAINER (Node.js ESM Runtime)")
    
    # Inner Containers
    draw_card(c, 210, 390, 180, 75, "Express HTTP / WS", "server.ts (Port 3000)", COLOR_GREEN)
    draw_card(c, 420, 390, 180, 75, "ConversationManager", "ConversationManager.ts", COLOR_GREEN)
    
    draw_card(c, 210, 290, 180, 75, "State Engine", "ConversationState.ts", COLOR_GREEN)
    draw_card(c, 420, 290, 180, 75, "LLM Extraction Service", "extractClaimData.ts", COLOR_GREEN)
    
    draw_card(c, 210, 190, 180, 75, "Claim Logger Service", "claimLogger.ts", COLOR_GREEN)
    draw_card(c, 420, 190, 180, 75, "Notification Service", "notificationService.ts", COLOR_GREEN)
    
    draw_card(c, 210, 125, 390, 50, "Environment & Config", "policies.json, requiredFields.ts, constants.ts", COLOR_GREEN)

    # External Integrations
    draw_card(c, 650, 390, 110, 75, "Gemini 2.5 API", "REST / SSE", COLOR_ORANGE)
    draw_card(c, 650, 290, 110, 75, "Google Sheets", "v4 REST API", COLOR_PURPLE)
    draw_card(c, 650, 190, 110, 75, "Resend Email", "REST SDK", COLOR_PURPLE)

    # Arrows
    c.setStrokeColor(COLOR_TEXT_MAIN)
    c.setLineWidth(1)
    c.line(160, 315, 210, 425)
    c.line(390, 427, 420, 427)
    c.line(510, 390, 510, 365)
    c.line(600, 327, 650, 427)
    c.line(390, 227, 650, 327)
    c.line(600, 227, 650, 227)

# -----------------------------------------------------------------------------
# PAGE 3: COMPONENT DIAGRAM (C3)
# -----------------------------------------------------------------------------
def render_page3(c):
    draw_header_footer(c, 3, "Component Diagram (C4 Level 3)", "Modular services composing the ConversationManager domain orchestration engine")
    
    # Core Orchestrator Box
    draw_card(c, 300, 430, 200, 65, "ConversationManager", "Core Orchestration & Routing", COLOR_GREEN, colors.HexColor('#dcfce7'))
    
    # Components Grid
    draw_card(c, 50, 310, 150, 75, "VerifyPolicyService", "verifyPolicy.ts", COLOR_GREEN)
    draw_card(c, 230, 310, 150, 75, "ExtractClaimData", "extractClaimData.ts", COLOR_GREEN)
    draw_card(c, 410, 310, 150, 75, "NormalizeClaimData", "normalizeClaimData.ts", COLOR_GREEN)
    draw_card(c, 590, 310, 150, 75, "RecommendServices", "recommendServices.ts", COLOR_GREEN)
    
    draw_card(c, 50, 180, 150, 75, "GenerateSummary", "generateSummary.ts", COLOR_GREEN)
    draw_card(c, 230, 180, 150, 75, "ClaimLoggerService", "claimLogger.ts", COLOR_GREEN)
    draw_card(c, 410, 180, 150, 75, "NotificationService", "notificationService.ts", COLOR_GREEN)
    draw_card(c, 590, 180, 150, 75, "EmpathyEngine", "EmpathyEngine.ts", COLOR_GREEN)

    # Dependencies Line
    c.setStrokeColor(COLOR_BORDER)
    c.setLineWidth(1)
    for px in [125, 305, 485, 665]:
        c.line(400, 430, px, 385)
        c.line(px, 310, px, 255)

# -----------------------------------------------------------------------------
# PAGE 4: SEQUENCE DIAGRAM
# -----------------------------------------------------------------------------
def render_page4(c):
    draw_header_footer(c, 4, "UML Request Sequence Diagram", "Synchronous voice interaction flow & non-blocking asynchronous persistence dispatch")
    
    # Lifelines
    lifelines = [
        ("Caller", 80, COLOR_GREY),
        ("Retell AI", 200, COLOR_BLUE),
        ("Railway Server", 340, COLOR_GREEN),
        ("ConversationManager", 480, COLOR_GREEN),
        ("Gemini 2.5", 620, COLOR_ORANGE),
        ("Sheets & Resend", 730, COLOR_PURPLE)
    ]
    
    for name, lx, color in lifelines:
        c.setFillColor(color)
        c.rect(lx - 45, 490, 90, 25, fill=True, stroke=False)
        c.setFillColor(colors.HexColor('#ffffff'))
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(lx, 500, name)
        
        c.setStrokeColor(COLOR_BORDER)
        c.setLineWidth(0.5)
        c.line(lx, 490, lx, 80)

    # Sequence Messages
    msgs = [
        (80, 200, 460, "1. Dial / Initiate Call", False),
        (200, 340, 435, "2. WS Connect & call_details", False),
        (340, 200, 410, "3. Greeting (\"Are you safe?\")", False),
        (80, 200, 380, "4. \"Yes safe. Policy MMI-10234 Arjun Rao.\"", False),
        (200, 340, 355, "5. response_required", False),
        (340, 480, 330, "6. handleUserMessage()", False),
        (480, 620, 305, "7. extract(userMessage, state)", False),
        (620, 480, 280, "8. Extracted Slots + Natural Response", False),
        (480, 340, 255, "9. Verified Policy & Response Text", False),
        (340, 200, 230, "10. response { content, content_complete }", False),
        
        # Async Block
        (480, 730, 175, "11. Async log() -> Append Google Sheet Row", True),
        (480, 730, 135, "12. Async sendMail() -> claims@aurallon.com", True)
    ]

    for x1, x2, y, text, is_async in msgs:
        if is_async:
            c.setStrokeColor(COLOR_PURPLE)
            c.setFillColor(COLOR_PURPLE)
            c.setLineWidth(1.5)
        else:
            c.setStrokeColor(COLOR_TEXT_MAIN)
            c.setFillColor(COLOR_TEXT_MAIN)
            c.setLineWidth(1)
            
        c.line(x1, y, x2, y)
        c.setFont("Helvetica-Bold" if is_async else "Helvetica", 8)
        c.drawString((x1 + x2) / 2 - 60, y + 4, text)

# -----------------------------------------------------------------------------
# PAGE 5: FINITE STATE MACHINE (FSM)
# -----------------------------------------------------------------------------
def render_page5(c):
    draw_header_footer(c, 5, "Claim Finite State Machine (FSM)", "Deterministic state transitions, retry limits, escalation paths, and completion gates")
    
    # State Nodes
    draw_card(c, 310, 440, 170, 50, "safety_check", "Initial Greeting & Safety", COLOR_BLUE)
    draw_card(c, 70, 340, 170, 50, "escalation", "Urgent Incident Alert", COLOR_RED, colors.HexColor('#fef2f2'))
    draw_card(c, 550, 340, 170, 50, "verification", "Policy & Name Lookup", COLOR_GREEN)
    
    draw_card(c, 70, 240, 170, 50, "callback_offer", "2 Verification Failures", COLOR_ORANGE)
    draw_card(c, 550, 240, 170, 50, "collecting_details", "FNOL Fields Collection", COLOR_GREEN)
    
    draw_card(c, 70, 140, 170, 50, "clarifying", "Invalid Reg / Ambiguity", COLOR_BLUE)
    draw_card(c, 550, 140, 170, 50, "recommending_services", "Towing / Garage Offer", COLOR_GREEN)
    
    draw_card(c, 310, 70, 170, 50, "completed", "Claim Logged & Dispatched", COLOR_GREEN, colors.HexColor('#dcfce7'))

    # Transitions
    c.setLineWidth(1.5)
    
    # safety -> escalation
    c.setStrokeColor(COLOR_RED)
    c.line(310, 465, 240, 365)
    c.setFillColor(COLOR_RED); c.setFont("Helvetica-Bold", 8); c.drawString(220, 420, "Injury / Severe")

    # safety -> verification
    c.setStrokeColor(COLOR_GREEN)
    c.line(480, 465, 550, 365)
    c.setFillColor(COLOR_GREEN); c.setFont("Helvetica-Bold", 8); c.drawString(510, 420, "Safe / Fine")

    # verification -> callback_offer
    c.setStrokeColor(COLOR_ORANGE)
    c.line(550, 365, 240, 265)
    c.setFillColor(COLOR_ORANGE); c.setFont("Helvetica-Bold", 8); c.drawString(370, 320, "Attempts >= 2")

    # verification -> collecting_details
    c.setStrokeColor(COLOR_GREEN)
    c.line(635, 340, 635, 290)
    c.setFillColor(COLOR_GREEN); c.setFont("Helvetica-Bold", 8); c.drawString(642, 315, "Verified Match")

    # collecting -> clarifying
    c.setStrokeColor(COLOR_BLUE)
    c.line(550, 265, 240, 165)
    c.setFillColor(COLOR_BLUE); c.setFont("Helvetica-Bold", 8); c.drawString(370, 220, "Malformed Input")

    # collecting -> recommending
    c.setStrokeColor(COLOR_GREEN)
    c.line(635, 240, 635, 190)
    c.setFillColor(COLOR_GREEN); c.setFont("Helvetica-Bold", 8); c.drawString(642, 215, "All Fields Done")

    # End paths -> completed
    c.setStrokeColor(COLOR_GREEN)
    c.line(635, 140, 480, 95)
    c.line(155, 340, 310, 95)
    c.line(155, 240, 310, 95)

# -----------------------------------------------------------------------------
# PAGE 6: DEPLOYMENT DIAGRAM
# -----------------------------------------------------------------------------
def render_page6(c):
    draw_header_footer(c, 6, "Deployment Topology & Trust Boundaries", "Infrastructure nodes, container boundaries, environment credentials, and network ports")
    
    # Boundary 1: Client
    draw_card(c, 40, 300, 140, 160, "Client Environment", "Inbound Call / Web Browser", COLOR_GREY)
    
    # Boundary 2: Retell Cloud
    draw_card(c, 210, 300, 150, 160, "Retell Cloud", "agent_e907d38b...", COLOR_BLUE)
    
    # Boundary 3: Railway Cloud Platform
    c.setStrokeColor(COLOR_GREEN)
    c.setFillColor(colors.HexColor('#f0fdf4'))
    c.setLineWidth(1.5)
    c.roundRect(390, 120, 210, 340, 8, fill=True, stroke=True)
    c.setFillColor(COLOR_GREEN)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(405, 442, "RAILWAY CLOUD PLATFORM")
    
    draw_card(c, 405, 270, 180, 150, "App Container", "Node.js ESM / Express / WS\nPort 3000", COLOR_GREEN)
    draw_card(c, 405, 140, 180, 110, "Env Credentials", "GEMINI_API_KEY\nRESEND_API_KEY\nGOOGLE_CREDENTIALS", COLOR_GREEN)

    # Boundary 4: External SaaS APIs
    draw_card(c, 630, 370, 130, 90, "Google Gemini", "generativelanguage.googleapis.com", COLOR_ORANGE)
    draw_card(c, 630, 250, 130, 90, "Google Sheets", "sheets.googleapis.com", COLOR_PURPLE)
    draw_card(c, 630, 130, 130, 90, "Resend Platform", "api.resend.com (aurallon.com)", COLOR_PURPLE)

    # Connectors
    c.setStrokeColor(COLOR_TEXT_MAIN)
    c.setLineWidth(1)
    c.line(180, 380, 210, 380)
    c.line(360, 380, 405, 380)
    c.line(585, 410, 630, 410)
    c.line(585, 300, 630, 300)
    c.line(585, 180, 630, 180)

# -----------------------------------------------------------------------------
# PAGE 7: DATA FLOW DIAGRAM
# -----------------------------------------------------------------------------
def render_page7(c):
    draw_header_footer(c, 7, "Data Flow & Transformation Pipeline", "Step-by-step data schema transformations from raw audio transcript to persistent records")
    
    steps = [
        ("1. Spoken Audio", "Caller Voice Input", COLOR_GREY),
        ("2. Raw Transcript", "Retell STT Engine", COLOR_BLUE),
        ("3. JSON Extraction", "Gemini 2.5 Flash Lite", COLOR_ORANGE),
        ("4. Normalized Claim Patch", "normalizeClaimData.ts", COLOR_GREEN),
        ("5. ConversationState", "State Machine Merge", COLOR_GREEN),
        ("6. Call Summary & Severity", "generateSummary.ts", COLOR_GREEN),
        ("7. Google Sheets Row", "Structured Claim Record", COLOR_PURPLE),
        ("8. Email Confirmation", "Resend REST SDK", COLOR_PURPLE),
        ("9. Claim Completed", "Customer Delivery", COLOR_GREEN)
    ]
    
    # 3x3 Grid Layout
    grid_coords = [
        (50, 380), (310, 380), (570, 380),
        (50, 240), (310, 240), (570, 240),
        (50, 100), (310, 100), (570, 100)
    ]
    
    for idx, (title, desc, color) in enumerate(steps):
        gx, gy = grid_coords[idx]
        draw_card(c, gx, gy, 170, 80, title, desc, color)
        
        # Connectors
        if idx in [0, 1, 3, 4, 6, 7]:
            c.setStrokeColor(COLOR_TEXT_MAIN)
            c.setLineWidth(1.5)
            c.line(gx + 170, gy + 40, gx + 260, gy + 40)
        elif idx in [2, 5]:
            c.setStrokeColor(COLOR_TEXT_MAIN)
            c.setLineWidth(1.5)
            c.line(gx + 85, gy, gx + 85, gy - 60)

# -----------------------------------------------------------------------------
# MAIN GENERATOR PIPELINE
# -----------------------------------------------------------------------------
def build_all_artifacts():
    pdf_path = os.path.join(BASE_DIR, 'Architecture.pdf')
    png_path = os.path.join(BASE_DIR, 'Architecture.png')
    svg_path = os.path.join(BASE_DIR, 'Architecture.svg')
    
    c = canvas.Canvas(pdf_path, pagesize=landscape(letter))
    
    # Render all 7 pages into PDF
    pages = [render_page1, render_page2, render_page3, render_page4, render_page5, render_page6, render_page7]
    for idx, page_fn in enumerate(pages):
        page_fn(c)
        c.showPage()
    
    c.save()
    print(f"✅ Generated 7-page PDF: {pdf_path}")

    # Render PDF -> High-Res PNG via PyMuPDF (fitz) at 200 DPI
    doc = fitz.open(pdf_path)
    page = doc[0] # Render Page 1 (or combined view)
    pix = page.get_pixmap(dpi=200)
    pix.save(png_path)
    print(f"✅ Rendered high-res PNG (Page 1 preview): {png_path}")

if __name__ == '__main__':
    build_all_artifacts()
