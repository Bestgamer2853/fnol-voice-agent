import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.pdfgen import canvas

def generate_executive_one_pager(filename="Architecture_One_Pager.pdf"):
    # Letter size: 612 x 792 pt. 24pt margins = 564pt printable width, 744pt printable height.
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=24,
        rightMargin=24,
        topMargin=20,
        bottomMargin=20
    )

    styles = getSampleStyleSheet()

    # Google Cloud / Stripe Enterprise Color Palette
    PRIMARY = colors.HexColor('#0F172A')       # Slate 900
    BLUE_ACCENT = colors.HexColor('#0284C7')   # Sky 600
    ROYAL_BLUE = colors.HexColor('#1D4ED8')    # Blue 700
    TEXT_DARK = colors.HexColor('#1E293B')     # Slate 800
    TEXT_MUTED = colors.HexColor('#64748B')    # Slate 500
    BG_LIGHT = colors.HexColor('#F8FAFC')      # Slate 50
    BORDER_COLOR = colors.HexColor('#E2E8F0')  # Slate 200

    # Typography Rules
    t_header_main = ParagraphStyle('HMain', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=13, leading=15, textColor=colors.white)
    t_header_sub = ParagraphStyle('HSub', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=colors.HexColor('#38BDF8'))
    
    sec_title = ParagraphStyle('SecTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=10.5, textColor=ROYAL_BLUE, spaceBefore=0, spaceAfter=2)
    
    p_body = ParagraphStyle('PBody', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=TEXT_DARK)
    p_code = ParagraphStyle('PCode', parent=styles['Normal'], fontName='Courier', fontSize=6.5, leading=8, textColor=PRIMARY)
    
    p_table_h = ParagraphStyle('PTableH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white)
    p_table_b = ParagraphStyle('PTableB', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=8.5, textColor=TEXT_DARK)

    story = []

    # 1. ENTERPRISE HEADER BANNER
    header_data = [[
        Paragraph("MERIDIAN MOTOR INSURANCE — VOICE AI ARCHITECTURE", t_header_main),
        Paragraph("EXECUTIVE ARCHITECTURE BRIEF<br/><b>Single-Page Technical Summary</b>", ParagraphStyle('HRight', parent=t_header_sub, alignment=2))
    ]]
    header_table = Table(header_data, colWidths=[340, 224])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), PRIMARY),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))

    # 2. SECTION 1: EXECUTIVE SUMMARY
    story.append(Paragraph("1. EXECUTIVE SUMMARY", sec_title))
    overview_text = "Meridian Voice AI automates motor insurance First Notice of Loss (FNOL) intake, replacing 20-minute call center queues with sub-second (&lt;800ms) conversational AI. The system pairs real-time voice streaming and single-pass LLM entity extraction with a deterministic state machine, delivering 100% regulatory compliance and non-blocking outbox persistence."
    overview_table = Table([[Paragraph(overview_text, p_body)]], colWidths=[564])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 4))

    # 3. SECTION 2: SYSTEM ARCHITECTURE
    story.append(Paragraph("2. SYSTEM ARCHITECTURE", sec_title))
    diag_text = """
    <b>[Caller Voice]</b> &lt;---(Real-Time Audio)---&gt; <b>[Telephony Voice Gateway]</b> &lt;---(WS JSON Chunks)---&gt; <b>[Real-Time Voice Orchestrator]</b><br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│ ├─ <b>Finite State Machine</b> (Compliance Engine)<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│ └─ <b>Flash LLM Extractor</b> (Single-Pass SSE)<br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼ <i>(Async Outbox)</i><br/>
    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<b>[Multi-Channel Outbox]</b> ──► Local Disk + Google Sheets + Resend Email
    """
    diag_table = Table([[Paragraph(diag_text, p_code)]], colWidths=[564])
    diag_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 0.5, ROYAL_BLUE),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(diag_table)
    story.append(Spacer(1, 4))

    # 4. SECTION 3: ARCHITECTURAL TRADE-OFFS
    story.append(Paragraph("3. ARCHITECTURAL TRADE-OFFS", sec_title))
    tradeoff_data = [
        [Paragraph("Design Choice", p_table_h), Paragraph("Strategic Benefit (Pros)", p_table_h), Paragraph("Architectural Trade-off (Cons)", p_table_h)],
        [Paragraph("Deterministic FSM vs Pure LLM", p_table_b), Paragraph("100% regulatory compliance & zero misrouted emergencies", p_table_b), Paragraph("Slightly reduced conversational flexibility", p_table_b)],
        [Paragraph("In-Memory State vs Redis", p_table_b), Paragraph("Sub-millisecond turn latency with zero network overhead", p_table_b), Paragraph("State tied to container lifecycle; single-pod bottleneck", p_table_b)],
        [Paragraph("Google Sheets vs Relational DB", p_table_b), Paragraph("Immediate, human-readable claim portal for adjusters", p_table_b), Paragraph("Subject to API rate limits (429) & lacks ACID guarantees", p_table_b)],
        [Paragraph("Flash LLM vs Frontier Model", p_table_b), Paragraph("Sub-350ms TTFT; 90% lower cost per claim turn", p_table_b), Paragraph("Slightly lower reasoning depth on complex edge cases", p_table_b)],
        [Paragraph("Async vs Sync Persistence", p_table_b), Paragraph("Decouples persistence I/O from real-time audio budget", p_table_b), Paragraph("Requires background fault mitigation for dropped tasks", p_table_b)]
    ]
    t_tradeoff = Table(tradeoff_data, colWidths=[130, 217, 217])
    t_tradeoff.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), ROYAL_BLUE),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 2.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_tradeoff)
    story.append(Spacer(1, 4))

    # 5. SECTION 4: KEY ARCHITECTURAL DECISIONS
    story.append(Paragraph("4. KEY ARCHITECTURAL DECISIONS", sec_title))
    decisions_col1 = [
        "<b>Hybrid Orchestration:</b> Stochastic LLM handles entity extraction; deterministic FSM strictly enforces policy checks and medical escalations.",
        "<b>Sub-Second Latency Budget:</b> Flash LLM over Server-Sent Events delivers ~350ms TTFT to meet &lt;800ms glass-to-glass latency target."
    ]
    decisions_col2 = [
        "<b>Asynchronous Persistence:</b> Persistence writes execute out-of-band to ensure zero voice audio lag or turn blocking.",
        "<b>Single-Pass Extraction:</b> Enforced JSON schema returns spoken language and slots in a single network turn."
    ]
    dec_table = Table([[Paragraph("<br/>".join([f"• {d}" for d in decisions_col1]), p_body), Paragraph("<br/>".join([f"• {d}" for d in decisions_col2]), p_body)]], colWidths=[279, 279])
    dec_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('PADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(dec_table)
    story.append(Spacer(1, 4))

    # 6. SECTION 5: FAILURE MODES & RESILIENCE MATRIX
    story.append(Paragraph("5. FAILURE MODES & RESILIENCE MATRIX", sec_title))
    failure_data = [
        [Paragraph("Failure Mode", p_table_h), Paragraph("Business Impact", p_table_h), Paragraph("Current Mitigation", p_table_h), Paragraph("Production Solution", p_table_h)],
        [Paragraph("Container Restart", p_table_b), Paragraph("In-flight state reset", p_table_b), Paragraph("Session cleanup on disconnect", p_table_b), Paragraph("Redis Cluster + Redlock mutex", p_table_b)],
        [Paragraph("Sheets API Down", p_table_b), Paragraph("Storage delay", p_table_b), Paragraph("Local disk outbox buffer", p_table_b), Paragraph("Durable Kafka event streaming", p_table_b)],
        [Paragraph("LLM Gateway Timeout", p_table_b), Paragraph("Turn stall", p_table_b), Paragraph("Secondary API provider failover", p_table_b), Paragraph("Circuit breaker + multi-region", p_table_b)],
        [Paragraph("Email API Error", p_table_b), Paragraph("Delayed notification", p_table_b), Paragraph("Silent failure recovery log", p_table_b), Paragraph("Worker retry queue with backoff", p_table_b)]
    ]
    t_failure = Table(failure_data, colWidths=[100, 100, 172, 192])
    t_failure.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 2.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_failure)
    story.append(Spacer(1, 4))

    # 7. SECTION 6: ARCHITECTURAL EVOLUTION & SECTION 7: PHILOSOPHY
    story.append(Paragraph("6. ARCHITECTURAL EVOLUTION & 7. ARCHITECT'S PHILOSOPHY", sec_title))

    evolution_text = """
    <b>PROTOTYPE PHASE</b><br/>
    • In-Memory Session Map<br/>
    • Single Container Instance<br/>
    • Async Sheets + Disk Outbox
    """
    prod_text = """
    <b>PRODUCTION EVOLUTION</b><br/>
    • Distributed Redis Cluster<br/>
    • Stateless K8s Pod Auto-scaling<br/>
    • Kafka + PostgreSQL + OTel
    """
    
    evo_table_data = [[Paragraph(evolution_text, p_body), Paragraph("<b>==&gt;</b>", ParagraphStyle('Arrow', parent=p_body, alignment=1, fontName='Helvetica-Bold', fontSize=10, textColor=ROYAL_BLUE)), Paragraph(prod_text, p_body)]]
    t_evo = Table(evo_table_data, colWidths=[100, 30, 110])
    t_evo.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 3),
    ]))

    arch_summary_text = "<b>ARCHITECT'S PHILOSOPHY:</b> This architecture establishes a strict separation between <b>stochastic intelligence</b> (LLM entity extraction) and the <b>deterministic control plane</b> (state machine business rules). By offloading heavy media processing to telephony gateways and executing persistence out-of-band, the system guarantees strict regulatory compliance while maintaining an enterprise-grade &lt;800ms voice latency budget."

    bottom_table = Table([[t_evo, Paragraph(arch_summary_text, p_body)]], colWidths=[246, 318])
    bottom_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(bottom_table)

    # Build Document
    doc.build(story)
    print(f"Successfully generated executive single-page PDF: {filename}")

if __name__ == "__main__":
    out_name = "Architecture_One_Pager.pdf"
    if len(sys.argv) > 1:
        out_name = sys.argv[1]
    generate_executive_one_pager(out_name)
