"""
Genera PDF ejecutivo de irregularidades LXC y apéndices de auditoría.

Uso: python scripts/generate-rejection-anomaly-report.py
Requiere: pip install reportlab
"""
import json
import os
from collections import defaultdict
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

REPORTS = os.path.join(os.path.dirname(__file__), "..", "reports")
AUDIT_JSON = os.path.join(REPORTS, "rejection-audit-ene-jun-2026.json")
SIN_ESP_JSON = os.path.join(REPORTS, "sin-especificar-audit.json")
SOLO_REJ_JSON = os.path.join(REPORTS, "solo-rechazado-kommo-audit.json")
IMPACT_JSON = os.path.join(REPORTS, "reconstruction-impact-ene-jun-2026.json")
PDF_OUT = os.path.join(REPORTS, "irregularidades-lxc-kommo-ene-jun-2026.pdf")
MD_OUT = os.path.join(REPORTS, "irregularidades-lxc-kommo-ene-jun-2026.md")


def load_json(path, default=None):
    if not os.path.isfile(path):
        return default if default is not None else {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def truncate(s, n=40):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def build_pdf():
    audit = load_json(AUDIT_JSON)
    sin_esp = load_json(SIN_ESP_JSON)
    solo_rej = load_json(SOLO_REJ_JSON)
    impact = load_json(IMPACT_JSON)

    summary = audit.get("summary", {})
    totals = summary.get("totals", {})
    lxc_rows = audit.get("lxc_irregularities", [])

    by_client = defaultdict(list)
    for row in lxc_rows:
        by_client[row["client"]].append(row)

    doc = SimpleDocTemplate(
        PDF_OUT,
        pagesize=letter,
        rightMargin=0.6 * inch,
        leftMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Heading1"], fontSize=16, spaceAfter=12)
    h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=12, spaceAfter=8)
    body = styles["Normal"]
    small = ParagraphStyle("Small", parent=body, fontSize=8, leading=10)

    story = []

    # Portada
    story.append(Paragraph("Reporte de irregularidades LXC vs timeline", title_style))
    story.append(
        Paragraph(
            f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')} · "
            f"Cohorte: {summary.get('cohort', {}).get('since', '?')} → "
            f"{summary.get('cohort', {}).get('until', '?')}",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            "<b>Metodología:</b> Leads rechazados creados ene–jun 2026. "
            "Irregularidad = motivo de rechazo con prefijo LXC- pero el timeline en Supabase "
            "muestra que el lead alcanzó MQL, SQL o CITA antes del rechazo. "
            "Fuente: API Kommo + eventos sincronizados.",
            body,
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            "<b>Nota clave:</b> LXC indica el catálogo de motivos de la etapa Lead por calificar, "
            "no la etapa alcanzada. Cuando el lead avanzó, el usuario puede haber seleccionado "
            "un motivo LXC- de todas formas.",
            body,
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    resumen_data = [
        ["Métrica", "Total"],
        ["Rechazados (cohorte)", str(totals.get("rejected", "—"))],
        ["Irregularidades LXC", str(totals.get("lxc_irregularity", len(lxc_rows)))],
        ["Sin especificar (API)", str(totals.get("sin_especificar", "—"))],
        ["Sin especificar (PDF ref.)", str(sin_esp.get("pdf", {}).get("sin_especificar", "—"))],
        ["Solo evento RECHAZADO", str(totals.get("solo_rechazado", "—"))],
    ]
    t = Table(resumen_data, colWidths=[3.5 * inch, 2 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
            ]
        )
    )
    story.append(t)
    story.append(PageBreak())

    # Sección por cliente — irregularidades LXC
    story.append(Paragraph("Irregularidades LXC por cliente", title_style))
    for client in sorted(by_client.keys()):
        rows = by_client[client]
        story.append(Paragraph(f"{client} ({len(rows)} leads)", h2))
        table_data = [["ID", "Nombre", "Máx. etapa", "Motivo", "Fecha"]]
        for r in rows:
            table_data.append(
                [
                    str(r.get("id", "")),
                    truncate(r.get("name"), 35),
                    r.get("max_etapa", ""),
                    truncate(r.get("motivo"), 30),
                    r.get("fecha") or "—",
                ]
            )
        tbl = Table(
            table_data,
            colWidths=[0.75 * inch, 1.8 * inch, 1.0 * inch, 1.5 * inch, 0.85 * inch],
            repeatRows=1,
        )
        tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c5282")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(tbl)
        story.append(Spacer(1, 0.15 * inch))

    story.append(PageBreak())

    # Apéndice sin especificar
    story.append(Paragraph('Apéndice A: Rechazados "Sin especificar"', title_style))
    api_sin = sin_esp.get("api", {})
    story.append(
        Paragraph(
            f"Total API: <b>{api_sin.get('sin_especificar', '—')}</b> de "
            f"{api_sin.get('total_rechazados', '—')} rechazados "
            f"({api_sin.get('pct', '—')}%). "
            f"PDF referencia: {sin_esp.get('pdf', {}).get('sin_especificar', '—')}.",
            body,
        )
    )
    by_c = sin_esp.get("by_client", {})
    if by_c:
        bc_data = [["Cliente", "Sin especificar", "Total rech.", "%", "Solo RECHAZADO", "Timeline parcial"]]
        for client in sorted(by_c.keys()):
            v = by_c[client]
            bc_data.append(
                [
                    client,
                    str(v.get("sin_especificar", 0)),
                    str(v.get("total_rechazados", 0)),
                    f"{v.get('pct', 0)}%",
                    str(v.get("solo_rechazado", 0)),
                    str(v.get("con_timeline_parcial", 0)),
                ]
            )
        t2 = Table(bc_data, colWidths=[1.4 * inch] + [0.9 * inch] * 5)
        t2.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#744210")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ]
            )
        )
        story.append(Spacer(1, 0.1 * inch))
        story.append(t2)

    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph("Muestra API — loss_reason_id nulo (5 por cliente)", h2))
    samples = sin_esp.get("samples_per_client", {})
    for client in sorted(samples.keys()):
        story.append(Paragraph(f"<b>{client}</b> (API)", body))
        samp_data = [["ID", "Nombre", "Fecha creación", "Fecha rechazo", "Etapa", "Motivo"]]
        for s in samples[client][:5]:
            samp_data.append(
                [
                    str(s.get("id", "")),
                    truncate(s.get("name"), 30),
                    s.get("fecha_creacion") or "—",
                    s.get("fecha_rechazo") or "—",
                    s.get("etapa", "RECHAZADO"),
                    s.get("motivo", "sin especificar"),
                ]
            )
        st = Table(samp_data, colWidths=[0.7 * inch, 1.6 * inch, 0.9 * inch, 0.9 * inch, 0.8 * inch, 1.0 * inch])
        st.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ]
            )
        )
        story.append(st)
        story.append(Spacer(1, 0.08 * inch))

    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            f"Muestra PDF referencia ({sin_esp.get('pdf', {}).get('sin_especificar', '—')} leads "
            f"con motivo vacío en export PDF — 5 por cliente para verificación en Kommo)",
            h2,
        )
    )
    pdf_samples = sin_esp.get("pdf_samples_per_client", {})
    pdf_by_c = sin_esp.get("pdf_by_client", {})
    if pdf_by_c:
        pbc = [["Cliente", "Sin especificar (PDF)"]]
        for client in sorted(pdf_by_c.keys()):
            pbc.append([client, str(pdf_by_c[client])])
        tp = Table(pbc, colWidths=[3 * inch, 2 * inch])
        tp.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#744210")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ]
            )
        )
        story.append(tp)
        story.append(Spacer(1, 0.1 * inch))
    for client in sorted(pdf_samples.keys()):
        story.append(Paragraph(f"<b>{client}</b> (PDF)", body))
        samp_data = [["ID", "Nombre", "Fecha creación", "Fecha rechazo", "Etapa", "Motivo"]]
        for s in pdf_samples[client][:5]:
            samp_data.append(
                [
                    str(s.get("id", "")),
                    truncate(s.get("name"), 30),
                    s.get("fecha_creacion") or "—",
                    s.get("fecha_rechazo") or "—",
                    s.get("etapa", "RECHAZADO"),
                    s.get("motivo", "sin especificar"),
                ]
            )
        st = Table(samp_data, colWidths=[0.7 * inch, 1.6 * inch, 0.9 * inch, 0.9 * inch, 0.8 * inch, 1.0 * inch])
        st.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ]
            )
        )
        story.append(st)
        story.append(Spacer(1, 0.08 * inch))

    story.append(PageBreak())

    # Apéndice solo RECHAZADO
    sr_sum = solo_rej.get("summary", {})
    if sr_sum:
        story.append(Paragraph("Apéndice B: Verificación solo RECHAZADO vs Kommo API", title_style))
        story.append(
            Paragraph(
                f"Leads con único evento RECHAZADO en Supabase: <b>{sr_sum.get('total', '—')}</b>. "
                f"Confirmados en Kommo (sin transiciones): <b>{sr_sum.get('confirmed', '—')}</b> "
                f"({sr_sum.get('confirmed_pct', '—')}%). "
                f"Eventos faltantes en sync: {sr_sum.get('evento_faltante', '—')}. "
                f"Errores API: {sr_sum.get('error_api', '—')}.",
                body,
            )
        )

    # Apéndice reconstrucción
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph("Apéndice C: Evaluación de reconstrucción (simulado, no aplicado)", title_style))
    glob = impact.get("global", {})
    story.append(
        Paragraph(
            f"<b>Conclusión:</b> {glob.get('conclusion', 'Sin datos de impacto.')} "
            f"Delta MQL global simulado: {glob.get('delta_mql', '—')}. "
            f"Leads afectados: {glob.get('leads_affected', '—')}. "
            f"Conversaciones: sin cambio.",
            body,
        )
    )
    by_imp = impact.get("by_client", [])
    if by_imp:
        imp_data = [["Cliente", "MQL actual", "MQL simulado", "Δ MQL", "Leads afect.", "Veredicto"]]
        for c in by_imp:
            imp_data.append(
                [
                    c.get("client", ""),
                    str(c.get("reached_mql_current", "")),
                    str(c.get("reached_mql_reconstructed", "")),
                    str(c.get("delta_mql", "")),
                    str(c.get("leads_affected", "")),
                    truncate(c.get("veredicto", ""), 35),
                ]
            )
        ti = Table(imp_data, colWidths=[1.2 * inch, 0.85 * inch, 0.95 * inch, 0.6 * inch, 0.75 * inch, 2.0 * inch])
        ti.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#276749")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ]
            )
        )
        story.append(Spacer(1, 0.1 * inch))
        story.append(ti)

    doc.build(story)
    print(f"PDF: {PDF_OUT}")


def build_md():
    audit = load_json(AUDIT_JSON)
    sin_esp = load_json(SIN_ESP_JSON)
    impact = load_json(IMPACT_JSON)
    lxc_rows = audit.get("lxc_irregularities", [])
    totals = audit.get("summary", {}).get("totals", {})

    lines = [
        "# Irregularidades LXC vs timeline — ene–jun 2026",
        "",
        f"Generado: {datetime.now().isoformat()}",
        "",
        "## Resumen",
        "",
        f"- Rechazados cohorte: **{totals.get('rejected', '—')}**",
        f"- Irregularidades LXC: **{totals.get('lxc_irregularity', len(lxc_rows))}**",
        f"- Sin especificar (API): **{totals.get('sin_especificar', '—')}**",
        "",
    ]

    by_client = defaultdict(list)
    for row in lxc_rows:
        by_client[row["client"]].append(row)

    for client in sorted(by_client.keys()):
        lines.append(f"## {client}")
        lines.append("")
        lines.append("| ID | Nombre | Máx. etapa | Motivo | Fecha |")
        lines.append("|---:|---|---|---|---|")
        for r in by_client[client]:
            lines.append(
                f"| {r.get('id')} | {r.get('name', '')} | {r.get('max_etapa')} | "
                f"{r.get('motivo', '')} | {r.get('fecha', '—')} |"
            )
        lines.append("")

    lines.append("## Apéndice: Sin especificar")
    lines.append("")
    lines.append(f"API (loss_reason_id nulo): **{totals.get('sin_especificar', '—')}**")
    lines.append(f"PDF referencia: **{sin_esp.get('pdf', {}).get('sin_especificar', '—')}**")
    lines.append("")
    samples = sin_esp.get("pdf_samples_per_client", {})
    for client in sorted(samples.keys()):
        lines.append(f"### {client}")
        for s in samples[client][:5]:
            lines.append(
                f"- **{s.get('id')}** {s.get('name')} — creación {s.get('fecha_creacion')}, "
                f"rechazo {s.get('fecha_rechazo')}, motivo: sin especificar"
            )
        lines.append("")

    lines.append("## Apéndice: Impacto reconstrucción (simulado)")
    lines.append("")
    lines.append(f"{impact.get('global', {}).get('conclusion', 'N/A')}")
    lines.append("")

    with open(MD_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"MD: {MD_OUT}")


if __name__ == "__main__":
    if not os.path.isfile(AUDIT_JSON):
        raise SystemExit(f"Falta {AUDIT_JSON}. Ejecuta audit-rejection-anomalies.ts primero.")
    build_pdf()
    build_md()
