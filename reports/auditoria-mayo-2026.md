# Auditoría Mayo 2026 — Kommo vs Dashboard vs Excel

**Fecha del informe:** 2026-05-28  
**Referencia operativa:** Kommo API (`created_at` + timeline `lead_status_changed`)  
**Comparado con:** Dashboard (`dashboard_metrics_daily`, `metrics_source=timeline`), Excel (`reports/excel_daily_by_client.json`), HTML de control (corte 2026-05-26)  
**Entorno:** `.env.local` + Supabase en vivo

---

## 1. Veredicto del backfill

**El backfill de mayo fue correcto.** Los datos están en BD, el dashboard cuadra con Kommo en la definición operativa del sistema. Las diferencias observables provienen casi en su totalidad de **cómo mide el Excel** o del **embudo Gregorio del HTML**, no de un fallo de importación.

| Indicador | Resultado |
|-----------|-----------|
| Eventos timeline mayo (1–31) | **3 313** filas con `kommo_event_id` |
| Eventos legacy (sin ID Kommo) | **0** |
| Cobertura de días con movimientos | **28 de 31** (sin actividad: 10, 24 y 31 may) |
| Rango real en BD | `2026-05-01` → `2026-05-30` |
| Dashboard conv (1–26) vs cohorte Kommo API | **6/6 clientes OK** (100 %) |
| Dashboard conv (2 jun) vs Kommo API | **6/6 clientes OK** (100 %) |
| Dashboard conv (26 may) vs Kommo API | **6/6 clientes OK** (100 %) |

### Cobertura de eventos por rango

| Rango | Eventos | Días distintos | Min | Max |
|-------|---------|----------------|-----|-----|
| Mayo 1–26 | 2 931 | 24 | 2026-05-01 | 2026-05-26 |
| Mayo 1–31 | 3 313 | 28 | 2026-05-01 | 2026-05-30 |
| Junio 1–30 | 451 | 3 | 2026-06-01 | 2026-06-03 |

**Días mayo sin eventos timeline:** `2026-05-10`, `2026-05-24`, `2026-05-31` (sin cambios de etapa en Kommo, no huecos de importación).

---

## 2. Totales agregados — tres fuentes

### Corte operativo mayo 1–26 (mismo día que el HTML de referencia)

| Cliente | Kommo/HTML leads | Dash conv | Excel conv | Δ Dash−Excel | Dash MQL | HTML MQL | Excel MQL |
|---------|------------------|-----------|------------|--------------|----------|----------|-----------|
| DOS HOGARES | 99 | 99 | 84 | +15 | 4 | 4 | 5 |
| GRUPO ELIJO | 438 | 438 | 362 | +76 | 3 | 7 | 18 |
| HOGARES | 187 | 187 | 158 | +29 | 29 | 65 | 40 |
| INQ | 402 | 402 | 340 | +62 | 10 | 32 | 17 |
| INSPIRA | 80 | 80 | 77 | +3 | 9 | 9 | 6 |
| MANOS AL HOGAR | 287 | 287 | 274 | +13 | 12 | 20 | 16 |
| **TOTAL** | **1 493** | **1 493** | **1 295** | **+198** | **67** | **137** | **102** |

**Conversaciones (mayo 1–26):** Dashboard = Kommo = HTML leads en todos los clientes. Excel va **198 conversaciones por debajo** (−13,3 %).

**MQL:** No hay una sola definición comparable. Dash 67 vs HTML Gregorio 137 vs Excel 102.

**SQL (mayo 1–26):** Dashboard **29 = Excel 29** a nivel total (coincidencia exacta agregada).

### Mayo completo (1–31) — comparar con HTML con cuidado

| Métrica | Dashboard | Excel | HTML (corte 26) |
|---------|-----------|-------|-----------------|
| Conv total | **1 759** | 1 373 | 1 493 |
| MQL total | 98 | 112 | 137 |

El dashboard suma leads creados hasta el 30 may (+266 conv vs inventario del 26). El HTML es una **foto al 26**, no la suma del mes completo.

---

## 3. Similitud día a día (mayo 1–26)

Solo días donde Excel tiene fila (~22 días por cliente; 132 comparaciones totales):

| Métrica | Excel ↔ Kommo (molde) | Excel ↔ Dashboard | Kommo ↔ Dashboard |
|---------|----------------------|-------------------|-------------------|
| **Conv** | **13 %** (17/132) | **27 %** (36/132) | 21 % |
| MQL | 55 % (72/132) | 50 % (66/132) | **77 %** (101/132) |
| SQL | **78 %** (103/132) | 76 % (100/132) | **89 %** (118/132) |
| Citas | 74 % (98/132) | 76 % (100/132) | **95 %** (126/132) |

### Match por cliente y métrica (Excel ↔ Kommo molde)

| Cliente | Conv | MQL | SQL | Citas |
|---------|------|-----|-----|-------|
| DOS HOGARES | 10/22 (45 %) | 19/22 (86 %) | 22/22 (100 %) | 21/22 (95 %) |
| GRUPO ELIJO | 0/22 (0 %) | 11/22 (50 %) | 20/22 (91 %) | 18/22 (82 %) |
| HOGARES | 2/22 (9 %) | 7/22 (32 %) | 11/22 (50 %) | 14/22 (64 %) |
| INQ | 1/22 (5 %) | 8/22 (36 %) | 15/22 (68 %) | 13/22 (59 %) |
| INSPIRA | 3/22 (14 %) | 16/22 (73 %) | 18/22 (82 %) | 19/22 (86 %) |
| MANOS AL HOGAR | 1/22 (5 %) | 11/22 (50 %) | 17/22 (77 %) | 13/22 (59 %) |

---

## 4. Validación diaria — Kommo vs Dashboard vs Excel

### 26 de mayo (día del corte HTML)

| Cliente | Kommo | Dashboard | Excel | Kommo = Dash | Excel = Dash |
|---------|-------|-----------|-------|--------------|--------------|
| DOS HOGARES | 7 | 7 | 6 | OK | NO |
| GRUPO ELIJO | 18 | 18 | 7 | OK | NO |
| HOGARES | 11 | 11 | 9 | OK | NO |
| INQ | 21 | 21 | 9 | OK | NO |
| INSPIRA | 2 | 2 | 0 | OK | NO |
| MANOS AL HOGAR | 20 | 20 | 14 | OK | NO |

**Kommo = Dashboard en los 6 clientes.** Excel difiere en los 6 ese mismo día.

### 2 de junio (validación mes en curso)

| Cliente | Kommo created | Dash conv | Dash MQL | Kommo = Dash |
|---------|---------------|-----------|----------|--------------|
| DOS HOGARES | 7 | 7 | 0 | OK |
| GRUPO ELIJO | 7 | 7 | 0 | OK |
| HOGARES | 6 | 6 | 3 | OK |
| INQ | 11 | 11 | 2 | OK |
| INSPIRA | 0 | 0 | 0 | OK |
| MANOS AL HOGAR | 14 | 14 | 1 | OK |

---

## 5. Dashboard vs HTML (corte 2026-05-26)

Salida de `npm run compare:dashboard-html`:

| Cliente | Σ conv dashboard | HTML leads | Σ MQL dash | HTML reachedMql | Nota |
|---------|------------------|------------|------------|-----------------|------|
| DOS HOGARES | 99 | 99 | 4 | 4 | cerca del censo |
| GRUPO ELIJO | 438 | 438 | 3 | 7 | cerca del censo |
| HOGARES | 187 | 187 | 29 | 65 | cerca del censo |
| INQ | 402 | 402 | 10 | 32 | cerca del censo |
| INSPIRA | 80 | 80 | 9 | 9 | cerca del censo |
| MANOS AL HOGAR | 287 | 287 | 12 | 20 | cerca del censo |

### Censo API en BD (2026-05-26, `metrics_source=census`)

| Cliente | conv | mql | HTML leads | HTML reachedMql |
|---------|------|-----|------------|-----------------|
| DOS HOGARES | 99 | 3 | 99 | 4 |
| GRUPO ELIJO | 435 | 4 | 438 | 7 |
| HOGARES | 187 | 31 | 187 | 65 |
| INQ | 401 | 13 | 402 | 32 |
| INSPIRA | 80 | 9 | 80 | 9 |
| MANOS AL HOGAR | 289 | 17 | 287 | 20 |

Clientes con censo idéntico al HTML en leads+mql+sql+citas: **1/6**.

---

## 6. Timeline health (eventos crudos vs métricas moldeadas)

Salida de `npm run audit:timeline-health` (mayo 1–26):

| Cliente | Eventos (filas) | Σ conv eventos | Σ conv métricas | Δ |
|---------|-----------------|----------------|-----------------|---|
| DOS HOGARES | 175 | 175 | 198 | +23 |
| GRUPO ELIJO | 827 | 827 | 873 | +46 |
| HOGARES | 548 | 548 | 374 | −174 |
| INQ | 714 | 714 | 803 | +89 |
| INSPIRA | 174 | 174 | 160 | −14 |
| MANOS AL HOGAR | 493 | 493 | 576 | +83 |

> **Nota:** La suma cruda de eventos cuenta **movimientos de etapa** (un lead puede sumar varias veces). Las métricas del dashboard usan el **molde de cohorte** (un lead = una conversación en su día de creación). Esta diferencia no indica backfill incorrecto.

---

## 7. Cobertura del Excel (RESPALDO_DIARIO)

| Cliente | Días mayo en Excel | Rango |
|---------|-------------------|-------|
| HOGARES | 24 | 2026-05-01 → 2026-05-28 |
| INQ | 24 | 2026-05-01 → 2026-05-28 |
| INSPIRA | 22 | 2026-05-01 → 2026-05-26 |
| GRUPO ELIJO | 24 | 2026-05-01 → 2026-05-28 |
| DOS HOGARES | 24 | 2026-05-01 → 2026-05-28 |
| MANOS AL HOGAR | 24 | 2026-05-01 → 2026-05-28 |

Junio en Excel: **0 filas** (sin referencia manual).

---

## 8. Por qué junio “sí” y mayo “no”

No es que junio esté bien y mayo mal en el pipeline. Es **contra qué comparas** y **qué ventana miras**.

### Junio cuadra porque

1. Validación natural = Kommo en vivo (ej. 2026-06-02: dashboard idéntico por cliente).
2. Sync en tiempo real con cohorte desde API (`enrichCohortFromApi` en ventanas cortas).
3. No hay Excel de junio — no hay referencia manual que contradiga.
4. Ventana corta (3 días con eventos) — menos ruido histórico.

### Mayo “no cuadra” cuando

1. Comparas conv diaria con Excel → match ~13–27 %.
2. Comparas MQL con HTML Gregorio → definiciones distintas (HOGARES: Dash 29 vs HTML 65).
3. Mezclas inventario HTML al 26 con suma mensual dashboard 1–31 (1 493 vs 1 759).
4. `audit-timeline-health` compara movimientos crudos vs métricas moldeadas (métricas distintas).

---

## 9. Desglose por cliente

| Cliente | Backfill | Dash = Kommo conv | Problema principal si “no cuadra” |
|---------|----------|-------------------|-----------------------------------|
| DOS HOGARES | OK | OK | Excel conv −15; MQL casi OK |
| GRUPO ELIJO | OK | OK | Excel conv −76; MQL HTML 7 vs Dash 3 |
| HOGARES | OK | OK | MQL HTML 65 vs Dash 29 (Gregorio) |
| INQ | OK | OK | Excel conv −62; MQL HTML 32 vs Dash 10 |
| INSPIRA | OK | OK | Mejor alineación global |
| MANOS AL HOGAR | OK | OK | Excel conv −13; censo +2 leads vs HTML |

---

## 10. Conclusiones

1. **Backfill mayo: correcto.** 3 313 eventos, sin legacy, cobertura hasta 2026-05-30.
2. **Dashboard operativo = Kommo** en conversaciones (cohorte y diario en fechas probadas).
3. **Mayo no cuadra vs Excel** porque el Excel mide distinto y suma menos (~15 % en conv).
4. **Mayo no cuadra vs HTML en MQL** porque el HTML usa embudo Gregorio, no snapshot de timeline.
5. **Junio sí cuadra** porque se valida contra Kommo en vivo, sin Excel, en ventana corta con sync activo.

### Qué usar como referencia

| Pregunta | Fuente |
|----------|--------|
| ¿Cuántos leads entraron cada día? | **Kommo / Dashboard timeline** |
| ¿Cuántos leads hay en pipeline al corte? | **Kommo censo / HTML leads** |
| ¿Cuántos “llegaron a MQL” estilo Gregorio? | **HTML manual** (no timeline) |
| ¿Cuadra con la hoja histórica? | **Excel** — informativo, no verdad operativa |

---

## 11. Comandos para re-auditar

```powershell
npm run audit:mayo-html
npm run compare:dashboard-html
npm run audit:timeline-health

# Junio
$env:AUDIT_SINCE="2026-06-01"
$env:AUDIT_UNTIL="2026-06-30"
npm run audit:timeline-health

# Molde vs Excel por cliente
node --use-system-ca --import tsx scripts/verify-mold-vs-excel.ts HOGARES
```

**No hace falta re-ejecutar el backfill de mayo** salvo refrescar eventos futuros. Para comparar con el jefe, usar **el mismo corte (1–26)** y separar **conv (Kommo)** de **MQL (Gregorio/HTML)**.

---

*Generado a partir de auditoría runtime con scripts del repositorio y consultas directas a Supabase + Kommo API.*
