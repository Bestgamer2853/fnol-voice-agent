import os
import sys
import fitz  # PyMuPDF
from reportlab.lib.pagesizes import letter, landscape, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Group, Polygon

def generate_drawio_xml(filename="Executive_Architecture_Brief.drawio"):
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="Electron" modified="2026-08-02T20:18:00.000Z" agent="Mozilla/5.0" version="21.6.8" type="device">
  <diagram id="c4-container-diagram" name="C4 Container View — FNOL Voice AI">
    <mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- Header -->
        <mxCell id="hdr" value="MERIDIAN MOTOR INSURANCE — VOICE AI PLATFORM&#10;C4 System Architecture &amp; Container View" style="text;html=1;strokeColor=none;fillColor=#0F172A;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=1;fontColor=#FFFFFF;fontStyle=1;fontSize=16;" vertex="1" parent="1">
          <mxGeometry x="40" y="20" width="1089" height="50" as="geometry" />
        </mxCell>
        
        <!-- Caller -->
        <mxCell id="caller" value="Caller (Voice)&#10;[Person]&#10;Mobile / WebRTC User" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F8FAFC;strokeColor=#475569;strokeWidth=2;fontColor=#0F172A;fontStyle=1;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="40" y="180" width="160" height="90" as="geometry" />
        </mxCell>
        
        <!-- Retell AI -->
        <mxCell id="retell" value="Retell AI Platform&#10;[Software System]&#10;Telephony Gateway &amp; Audio Transcriber" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#F0F9FF;strokeColor=#0284C7;strokeWidth=2;fontColor=#0F172A;fontStyle=1;fontSize=12;" vertex="1" parent="1">
          <mxGeometry x="260" y="180" width="190" height="90" as="geometry" />
        </mxCell>
        
        <!-- FNOL Voice Agent (Primary System - Dominant) -->
        <mxCell id="agent" value="FNOL Voice Agent&#10;[Container: Node.js / Railway]&#10;Primary Orchestrator &amp; State Machine Engine&#10;• TypeScript Finite State Machine (FSM)&#10;• Slot Normalization &amp; Regulatory Rules" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#EFF6FF;strokeColor=#1D4ED8;strokeWidth=3;fontColor=#0F172A;fontStyle=1;fontSize=13;" vertex="1" parent="1">
          <mxGeometry x="500" y="140" width="340" height="165" as="geometry" />
        </mxCell>

        <!-- Gemini 2.5 Flash Lite (Structured Entity Extraction) -->
        <mxCell id="gemini" value="Gemini 2.5 Flash Lite&#10;Structured Entity Extraction" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFBEB;strokeColor=#D97706;strokeWidth=2;fontColor=#0F172A;fontStyle=1;fontSize=11;" vertex="1" parent="1">
          <mxGeometry x="890" y="110" width="240" height="80" as="geometry" />
        </mxCell>

        <!-- Persistence & Notifications -->
        <mxCell id="persistence" value="Persistence &amp; Notifications&#10;• Google Sheets API&#10;• Resend Email API" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ECFDF5;strokeColor=#059669;strokeWidth=2;fontColor=#0F172A;fontStyle=1;fontSize=11;" vertex="1" parent="1">
          <mxGeometry x="890" y="250" width="240" height="80" as="geometry" />
        </mxCell>

        <!-- Connectors with explicit protocols -->
        <mxCell id="e1" value="Audio / WebRTC" style="edgeStyle=orthoEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#475569;strokeWidth=2;fontColor=#475569;fontSize=11;fontStyle=1;" edge="1" parent="1" source="caller" target="retell">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <mxCell id="e2" value="WebSocket JSON" style="edgeStyle=orthoEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#0284C7;strokeWidth=2;fontColor=#0284C7;fontSize=11;fontStyle=1;" edge="1" parent="1" source="retell" target="agent">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>

        <mxCell id="e3" value="HTTPS SSE (Inference)" style="edgeStyle=orthoEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#D97706;strokeWidth=2;fontColor=#D97706;fontSize=11;fontStyle=1;" edge="1" parent="1" source="agent" target="gemini">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="840" y="190" />
              <mxPoint x="840" y="150" />
            </Array>
          </mxGeometry>
        </mxCell>

        <mxCell id="e4" value="Async Outbox (REST API)" style="edgeStyle=orthoEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#059669;strokeWidth=2;fontColor=#059669;fontSize=11;fontStyle=1;" edge="1" parent="1" source="agent" target="persistence">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="840" y="260" />
              <mxPoint x="840" y="290" />
            </Array>
          </mxGeometry>
        </mxCell>

      </root>
    </mxGraphModel>
  </diagram>
</mxfile>"""
    with open(filename, "w", encoding="utf-8") as f:
        f.write(xml_content)
    print(f"Generated Draw.io XML: {filename}")


def create_vector_architecture_drawing():
    # Width 786 pt, Height 95 pt vector drawing for A4 Landscape PDF
    d = Drawing(786, 95)
    
    # Outer Container Boundary
    d.add(Rect(0, 0, 786, 95, fillColor=colors.HexColor('#F8FAFC'), strokeColor=colors.HexColor('#CBD5E1'), strokeWidth=0.5, rx=4, ry=4))
    
    # 1. Caller Box (x: 12, y: 25, w: 105, h: 45)
    d.add(Rect(12, 25, 105, 45, fillColor=colors.HexColor('#FFFFFF'), strokeColor=colors.HexColor('#475569'), strokeWidth=1.5, rx=3, ry=3))
    d.add(String(64.5, 52, "Caller Voice", fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor('#0F172A')))
    d.add(String(64.5, 36, "(Mobile / WebRTC)", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor('#64748B')))
    
    # Arrow 1: Caller -> Retell (Audio / WebRTC)
    d.add(Line(117, 47.5, 155, 47.5, strokeColor=colors.HexColor('#475569'), strokeWidth=1.5))
    d.add(Polygon([155, 50.5, 160, 47.5, 155, 44.5], fillColor=colors.HexColor('#475569'), strokeColor=colors.HexColor('#475569')))
    d.add(String(138.5, 52, "Audio / WebRTC", fontName="Helvetica-Bold", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor('#475569')))

    # 2. Retell Platform Box (x: 160, y: 25, w: 125, h: 45)
    d.add(Rect(160, 25, 125, 45, fillColor=colors.HexColor('#F0F9FF'), strokeColor=colors.HexColor('#0284C7'), strokeWidth=1.5, rx=3, ry=3))
    d.add(String(222.5, 52, "Retell AI Platform", fontName="Helvetica-Bold", fontSize=8, textAnchor="middle", fillColor=colors.HexColor('#0F172A')))
    d.add(String(222.5, 36, "(Telephony Gateway)", fontName="Helvetica", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor('#64748B')))

    # Arrow 2: Retell -> Agent (WebSocket JSON)
    d.add(Line(285, 47.5, 325, 47.5, strokeColor=colors.HexColor('#0284C7'), strokeWidth=1.5))
    d.add(Polygon([325, 50.5, 330, 47.5, 325, 44.5], fillColor=colors.HexColor('#0284C7'), strokeColor=colors.HexColor('#0284C7')))
    d.add(String(307.5, 52, "WebSocket JSON", fontName="Helvetica-Bold", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor('#0284C7')))

    # 3. Core Agent Box (PRIMARY DOMINANT SYSTEM - enlarged 10%) (x: 320, y: 8, w: 245, h: 79)
    d.add(Rect(320, 8, 245, 79, fillColor=colors.HexColor('#EFF6FF'), strokeColor=colors.HexColor('#1D4ED8'), strokeWidth=2.5, rx=4, ry=4))
    d.add(String(442.5, 68, "FNOL VOICE AGENT (PRIMARY SYSTEM)", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor('#1D4ED8')))
    d.add(String(442.5, 52, "State Machine & Regulatory Compliance Engine", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor('#0F172A')))
    d.add(String(442.5, 36, "• TypeScript Finite State Machine (FSM)", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor('#1E293B')))
    d.add(String(442.5, 20, "• Deterministic Rules & Policy Verification", fontName="Helvetica", fontSize=7, textAnchor="middle", fillColor=colors.HexColor('#1E293B')))

    # Arrow 3: Agent -> Gemini (Top Right: HTTPS SSE)
    d.add(Line(565, 60, 580, 60, strokeColor=colors.HexColor('#D97706'), strokeWidth=1.5))
    d.add(Polygon([580, 63, 585, 60, 580, 57], fillColor=colors.HexColor('#D97706'), strokeColor=colors.HexColor('#D97706')))
    d.add(String(572.5, 64, "HTTPS SSE", fontName="Helvetica-Bold", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor('#D97706')))

    # Arrow 4: Agent -> Persistence (Bottom Right: Async Outbox)
    d.add(Line(565, 30, 580, 30, strokeColor=colors.HexColor('#059669'), strokeWidth=1.5))
    d.add(Polygon([580, 33, 585, 30, 580, 27], fillColor=colors.HexColor('#059669'), strokeColor=colors.HexColor('#059669')))
    d.add(String(572.5, 34, "Async Outbox", fontName="Helvetica-Bold", fontSize=5.5, textAnchor="middle", fillColor=colors.HexColor('#059669')))

    # 4. Gemini Box (Structured Entity Extraction) (x: 585, y: 50, w: 188, h: 36)
    d.add(Rect(585, 50, 188, 36, fillColor=colors.HexColor('#FFFBEB'), strokeColor=colors.HexColor('#D97706'), strokeWidth=1.5, rx=3, ry=3))
    d.add(String(679, 72, "Gemini 2.5 Flash Lite", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor('#0F172A')))
    d.add(String(679, 58, "Structured Entity Extraction", fontName="Helvetica-Bold", fontSize=6.5, textAnchor="middle", fillColor=colors.HexColor('#D97706')))

    # 5. Persistence & Notifications Box (x: 585, y: 10, w: 188, h: 36)
    d.add(Rect(585, 10, 188, 36, fillColor=colors.HexColor('#ECFDF5'), strokeColor=colors.HexColor('#059669'), strokeWidth=1.5, rx=3, ry=3))
    d.add(String(679, 32, "Persistence & Notifications", fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle", fillColor=colors.HexColor('#0F172A')))
    d.add(String(679, 18, "• Google Sheets API • Resend Email API", fontName="Helvetica", fontSize=6, textAnchor="middle", fillColor=colors.HexColor('#059669')))

    return d


def generate_executive_pdf(filename="Executive_Architecture_Brief.pdf"):
    # A4 Landscape: 841.89 x 595.27 pt. Margins: 28pt left/right, 20pt top/bottom. Printable W = 785.89 pt, H = 555.27 pt.
    doc = SimpleDocTemplate(
        filename,
        pagesize=landscape(A4),
        leftMargin=28,
        rightMargin=28,
        topMargin=20,
        bottomMargin=20
    )

    styles = getSampleStyleSheet()

    PRIMARY = colors.HexColor('#0F172A')       # Slate 900
    ROYAL_BLUE = colors.HexColor('#1D4ED8')    # Blue 700
    SKY_BLUE = colors.HexColor('#0284C7')      # Sky 600
    TEXT_DARK = colors.HexColor('#1E293B')     # Slate 800
    BG_LIGHT = colors.HexColor('#F8FAFC')      # Slate 50
    BORDER_COLOR = colors.HexColor('#CBD5E1')  # Slate 300

    t_header_main = ParagraphStyle('HMain', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=13, leading=15, textColor=colors.white)
    t_header_sub = ParagraphStyle('HSub', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=colors.HexColor('#38BDF8'))
    
    sec_title = ParagraphStyle('SecTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8.5, leading=10.5, textColor=ROYAL_BLUE, spaceBefore=0, spaceAfter=2)
    p_body = ParagraphStyle('PBody', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=TEXT_DARK)
    p_table_h = ParagraphStyle('PTableH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white)
    p_table_b = ParagraphStyle('PTableB', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=8.5, textColor=TEXT_DARK)

    story = []

    # 1. HEADER BANNER
    header_data = [[
        Paragraph("MERIDIAN MOTOR INSURANCE — VOICE AI PLATFORM", t_header_main),
        Paragraph("EXECUTIVE ARCHITECTURE BRIEF<br/><b>Deliverable #3 | Single-Page C4 Container Brief</b>", ParagraphStyle('HRight', parent=t_header_sub, alignment=2))
    ]]
    header_table = Table(header_data, colWidths=[480, 305])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), PRIMARY),
        ('PADDING', (0,0), (-1,-1), 5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))

    # 2. EXECUTIVE SUMMARY & ARCHITECT'S PHILOSOPHY
    story.append(Paragraph("1. EXECUTIVE SUMMARY & ARCHITECTURAL PHILOSOPHY", sec_title))
    overview_text = "<b>EXECUTIVE SUMMARY:</b> Meridian Voice AI automates motor insurance First Notice of Loss (FNOL) claims, replacing 20-minute call center queues with sub-second (&lt;800ms) voice AI. The system pairs real-time voice streaming and single-pass LLM entity extraction with a deterministic TypeScript state machine, ensuring 100% regulatory compliance.<br/><b>ARCHITECT'S PHILOSOPHY:</b> Decouples <b>stochastic intelligence</b> (LLM entity extraction) from the <b>deterministic control plane</b> (state machine business rules). Out-of-band persistence and offloaded media processing guarantee compliance while meeting an enterprise &lt;800ms latency budget."
    overview_table = Table([[Paragraph(overview_text, p_body)]], colWidths=[785])
    overview_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(overview_table)
    story.append(Spacer(1, 4))

    # 3. VECTOR C4 SYSTEM ARCHITECTURE DIAGRAM
    story.append(Paragraph("2. SYSTEM ARCHITECTURE (C4 HIGH-LEVEL CONTAINER VIEW)", sec_title))
    vector_drawing = create_vector_architecture_drawing()
    story.append(vector_drawing)
    story.append(Spacer(1, 4))

    # 4. ARCHITECTURAL TRADE-OFFS
    story.append(Paragraph("3. ARCHITECTURAL TRADE-OFFS", sec_title))
    tradeoff_data = [
        [Paragraph("Decision", p_table_h), Paragraph("Strategic Benefit (Pros)", p_table_h), Paragraph("Current Limitation", p_table_h), Paragraph("Production Evolution", p_table_h)],
        [Paragraph("Deterministic FSM", p_table_b), Paragraph("100% compliance & zero misrouted emergencies", p_table_b), Paragraph("Rigid conversational paths", p_table_b), Paragraph("Dynamic sub-state routing", p_table_b)],
        [Paragraph("In-Memory State", p_table_b), Paragraph("Sub-ms turn latency with zero network overhead", p_table_b), Paragraph("State tied to container life", p_table_b), Paragraph("Redis Cluster + Redlock mutex", p_table_b)],
        [Paragraph("Google Sheets API", p_table_b), Paragraph("Immediate, human-readable claim portal for adjusters", p_table_b), Paragraph("Rate limits (429) & no ACID", p_table_b), Paragraph("PostgreSQL Relational DB", p_table_b)],
        [Paragraph("Flash LLM Model", p_table_b), Paragraph("Sub-350ms TTFT (~90% cheaper per turn)", p_table_b), Paragraph("Lower complex reasoning", p_table_b), Paragraph("Multi-model failover pool", p_table_b)],
        [Paragraph("Async Outbox", p_table_b), Paragraph("Unblocks voice turn audio latency (&lt;800ms)", p_table_b), Paragraph("Risks dropped background tasks", p_table_b), Paragraph("Kafka Event Streaming", p_table_b)]
    ]
    t_tradeoff = Table(tradeoff_data, colWidths=[110, 225, 225, 225])
    t_tradeoff.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), ROYAL_BLUE),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 2.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_tradeoff)
    story.append(Spacer(1, 4))

    # 5. KEY ARCHITECTURAL DECISIONS
    story.append(Paragraph("4. KEY ARCHITECTURAL DECISIONS", sec_title))
    decisions_col1 = [
        "<b>Deterministic FSM over Autonomous LLM:</b> Code owns state transitions & medical escalations to guarantee 100% regulatory compliance.",
        "<b>Low-Latency Gemini Extraction:</b> Single-pass JSON extraction over SSE delivers ~350ms TTFT, staying within the &lt;800ms budget."
    ]
    decisions_col2 = [
        "<b>Asynchronous Persistence:</b> Outbox pattern writes to Google Sheets and Resend out-of-band to prevent voice audio stalling.",
        "<b>Clear Separation of Responsibilities:</b> Media transport, conversation state, extraction, and persistence operate as decoupled layers."
    ]
    dec_table = Table([[Paragraph("<br/>".join([f"• {d}" for d in decisions_col1]), p_body), Paragraph("<br/>".join([f"• {d}" for d in decisions_col2]), p_body)]], colWidths=[389, 389])
    dec_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('PADDING', (0,0), (-1,-1), 3),
    ]))
    story.append(dec_table)
    story.append(Spacer(1, 4))

    # 6. FAILURE MODES & RESILIENCE MATRIX
    story.append(Paragraph("5. FAILURE MODES & RESILIENCE MATRIX", sec_title))
    failure_data = [
        [Paragraph("Failure", p_table_h), Paragraph("Impact", p_table_h), Paragraph("Current Prototype Mitigation", p_table_h), Paragraph("Production Solution", p_table_h)],
        [Paragraph("Pod Restart", p_table_b), Paragraph("In-flight state reset", p_table_b), Paragraph("Cleanup on disconnect", p_table_b), Paragraph("Redis Cluster + Redlock mutex", p_table_b)],
        [Paragraph("Sheets Down", p_table_b), Paragraph("Storage delay", p_table_b), Paragraph("Local disk outbox buffer", p_table_b), Paragraph("Durable Kafka event queue", p_table_b)],
        [Paragraph("LLM Timeout", p_table_b), Paragraph("Turn stall", p_table_b), Paragraph("Secondary API failover", p_table_b), Paragraph("Circuit breaker + multi-region", p_table_b)],
        [Paragraph("Email Fail", p_table_b), Paragraph("Delayed alert", p_table_b), Paragraph("Silent log recovery", p_table_b), Paragraph("Worker retry queue with backoff", p_table_b)]
    ]
    t_failure = Table(failure_data, colWidths=[100, 120, 282, 283])
    t_failure.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), PRIMARY),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 2.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_failure)
    story.append(Spacer(1, 4))

    # 7. PRODUCTION EVOLUTION (CAPABILITY-FIRST HEADLINES)
    story.append(Paragraph("6. PRODUCTION EVOLUTION PIPELINE", sec_title))
    evo_pipeline_text = "<b>PROTOTYPE (In-Memory)</b> &nbsp;--&gt;&nbsp; <b>EXTERNALIZED STATE</b> (Redis) &nbsp;--&gt;&nbsp; <b>DURABLE STORAGE</b> (Postgres) &nbsp;--&gt;&nbsp; <b>EVENT STREAMING</b> (Kafka) &nbsp;--&gt;&nbsp; <b>OBSERVABILITY</b> (OTel) &nbsp;--&gt;&nbsp; <b>HORIZONTAL SCALING</b> (K8s)"
    evo_table = Table([[Paragraph(evo_pipeline_text, ParagraphStyle('EvoText', parent=p_body, fontName='Helvetica-Bold', fontSize=6.5, leading=8, textColor=ROYAL_BLUE, alignment=1))]], colWidths=[785])
    evo_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), BG_LIGHT),
        ('BOX', (0,0), (-1,-1), 0.5, BORDER_COLOR),
        ('PADDING', (0,0), (-1,-1), 3.5),
    ]))
    story.append(evo_table)

    # Build Document
    doc.build(story)
    print(f"Successfully generated A4 Landscape Executive PDF: {filename}")


def export_pdf_to_images(pdf_filename="Executive_Architecture_Brief.pdf"):
    doc = fitz.open(pdf_filename)
    page = doc[0]
    
    # 300 DPI PNG
    png_filename = "Executive_Architecture_Brief.png"
    pix = page.get_pixmap(dpi=300)
    pix.save(png_filename)
    print(f"Generated 300 DPI PNG: {png_filename}")

    # Vector SVG
    svg_filename = "Executive_Architecture_Brief.svg"
    svg_content = page.get_svg_image()
    with open(svg_filename, "w", encoding="utf-8") as f:
        f.write(svg_content)
    print(f"Generated SVG Vector: {svg_filename}")


if __name__ == "__main__":
    generate_drawio_xml()
    generate_executive_pdf()
    export_pdf_to_images()
