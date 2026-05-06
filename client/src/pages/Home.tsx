/*
 * Filosofía visual: Swiss International Typographic Style aplicado a un war room ejecutivo de ventas.
 * Esta página prioriza jerarquía numérica, lectura asimétrica y alertas accionables para destrabar pipeline diario.
 * Pregunta guía: ¿esta decisión ayuda a entender qué cliente se atoró hoy?
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Filter,
  LineChart as LineChartIcon,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { assetUrls, pipelineData, stageLabels, type PipelineRow } from "@/lib/pipelineData";

type ClientRisk = {
  client: string;
  conversations: number;
  mql: number;
  sql: number;
  citas: number;
  firmas: number;
  score: number;
  level: "Crítico" | "Atención" | "Estable";
  reason: string;
};

const fmt = new Intl.NumberFormat("es-MX");
const pctFmt = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function shortDate(value?: string | null) {
  if (!value) return "—";
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function sumRows(rows: PipelineRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.CONVERSACIONES += row.CONVERSACIONES || 0;
      acc.MQL += row.MQL || 0;
      acc.SQL += row.SQL || 0;
      acc.CITAS += row.CITAS || 0;
      acc.FIRMAS += row.FIRMAS || 0;
      return acc;
    },
    { CONVERSACIONES: 0, MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0 },
  );
}

function groupByClient(rows: PipelineRow[]) {
  const grouped = new Map<string, PipelineRow[]>();
  rows.forEach((row) => grouped.set(row.CLIENTE, [...(grouped.get(row.CLIENTE) ?? []), row]));
  return Array.from(grouped.entries()).map(([client, clientRows]) => ({ client, ...sumRows(clientRows) }));
}

function buildRisks(rows: PipelineRow[]): ClientRisk[] {
  return groupByClient(rows)
    .map((row) => {
      const mqlRate = ratio(row.MQL, row.CONVERSACIONES);
      const sqlRate = ratio(row.SQL, row.MQL);
      const citaRate = ratio(row.CITAS, row.SQL || row.MQL);
      let score = 0;
      const reasons: string[] = [];

      if (row.CONVERSACIONES >= 20 && mqlRate < 0.12) {
        score += 34;
        reasons.push("muchas conversaciones con poca calificación MQL");
      }
      if (row.MQL >= 2 && row.SQL === 0) {
        score += 28;
        reasons.push("MQL sin avance a SQL");
      }
      if (row.SQL >= 1 && row.CITAS === 0) {
        score += 22;
        reasons.push("SQL sin cita agendada");
      }
      if (row.CITAS >= 1 && row.FIRMAS === 0) {
        score += 16;
        reasons.push("citas sin firma aún");
      }
      if (row.CONVERSACIONES < 5) {
        score += 8;
        reasons.push("bajo volumen observado");
      }

      return {
        client: row.client,
        conversations: row.CONVERSACIONES,
        mql: row.MQL,
        sql: row.SQL,
        citas: row.CITAS,
        firmas: row.FIRMAS,
        score,
        level: score >= 50 ? "Crítico" : score >= 22 ? "Atención" : "Estable",
        reason: reasons.length ? reasons.join("; ") : "flujo sin bloqueo principal detectado",
      } as ClientRisk;
    })
    .sort((a, b) => b.score - a.score || b.conversations - a.conversations);
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "orange" | "green" | "graphite" }) {
  return (
    <article className={`metric-card metric-card--${tone ?? "graphite"}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{sub}</span>
    </article>
  );
}

function FunnelStage({ label, value, max, index }: { label: string; value: number; max: number; index: number }) {
  const width = Math.max(9, (value / Math.max(max, 1)) * 100);
  return (
    <div className="funnel-stage" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="funnel-stage__label">
        <span>{label}</span>
        <strong>{fmt.format(value)}</strong>
      </div>
      <div className="funnel-stage__track">
        <div className="funnel-stage__bar" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function Home() {
  const daily = pipelineData.daily as unknown as PipelineRow[];
  const history = pipelineData.history as unknown as PipelineRow[];
  const availableDates = useMemo(() => Array.from(new Set(daily.map((row) => row.FECHA).filter((date): date is string => Boolean(date)))).sort(), [daily]);
  const clients = useMemo(() => Array.from(new Set(daily.map((row) => row.CLIENTE))).sort(), [daily]);
  const latestDate = availableDates.at(-1) ?? "";

  const [selectedDate, setSelectedDate] = useState<string>(latestDate);
  const [selectedClient, setSelectedClient] = useState<string>("Todos");

  const filteredRows = useMemo(() => {
    return daily.filter((row) => {
      const dateMatch = selectedDate === "Todas" || row.FECHA === selectedDate;
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      return dateMatch && clientMatch;
    });
  }, [daily, selectedDate, selectedClient]);

  const totals = useMemo(() => sumRows(filteredRows), [filteredRows]);
  const allTotals = useMemo(() => sumRows(daily), [daily]);
  const todayRows = useMemo(() => daily.filter((row) => row.FECHA === latestDate), [daily, latestDate]);
  const risks = useMemo(() => buildRisks(selectedDate === "Todas" ? daily : filteredRows), [daily, filteredRows, selectedDate]);

  const dailyTrend = useMemo(() => {
    return availableDates.map((date) => {
      const rows = daily.filter((row) => row.FECHA === date);
      return { fecha: shortDate(date), ...sumRows(rows) };
    });
  }, [availableDates, daily]);

  const clientBars = useMemo(() => groupByClient(filteredRows).sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES), [filteredRows]);

  const historicalByMonth = useMemo(() => {
    const months = Array.from(new Set(history.map((row) => row.MES).filter(Boolean)));
    return months.map((month) => {
      const rows = history.filter((row) => row.MES === month);
      const totals = sumRows(rows);
      const spend = rows.reduce((acc, row) => acc + (row["GASTO TOTAL"] || 0), 0);
      return { mes: month, ...totals, gasto: Math.round(spend) };
    });
  }, [history]);

  const funnelValues = stageLabels.map((stage) => ({ label: stage, value: totals[stage] ?? 0 }));
  const maxFunnel = Math.max(...funnelValues.map((stage) => stage.value), 1);
  const sqlRate = ratio(totals.SQL, totals.MQL);
  const citaRate = ratio(totals.CITAS, totals.SQL || totals.MQL);
  const firmaRate = ratio(totals.FIRMAS, totals.CITAS);
  const highestRisk = risks[0];

  return (
    <main className="dashboard-shell">
      <section className="hero-panel" style={{ backgroundImage: `linear-gradient(90deg, rgba(250,247,238,.97) 0%, rgba(250,247,238,.82) 45%, rgba(250,247,238,.50) 100%), url(${assetUrls.hero})` }}>
        <div className="hero-panel__eyebrow"><span /> Pipeline Clientes · Sinahi</div>
        <div className="hero-panel__grid">
          <div className="hero-copy">
            <h1>Tablero diario para ver dónde se está moviendo o atorando el pipeline.</h1>
            <p>
              Vista ejecutiva del documento <strong>Data_Clientes_2026</strong>. Resume conversaciones, MQL, SQL, citas y firmas para priorizar qué cliente necesita ayuda hoy.
            </p>
            <div className="hero-actions">
              <a href="#bloqueos">Ver bloqueos</a>
              <a href="#detalle" className="secondary-link">Revisar detalle</a>
            </div>
          </div>
          <div className="hero-diagnostic">
            <p>Lectura de hoy</p>
            <strong>{formatDate(latestDate)}</strong>
            <span>{todayRows.length} registros · {clients.length} clientes activos</span>
          </div>
        </div>
      </section>

      <section className="control-strip" aria-label="Filtros del tablero">
        <div>
          <Filter size={18} />
          <span>Filtro operativo</span>
        </div>
        <label>
          Fecha
          <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
            <option value="Todas">Todas</option>
            {availableDates.map((date) => (
              <option key={date} value={date}>{formatDate(date)}</option>
            ))}
          </select>
        </label>
        <label>
          Cliente
          <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
            <option value="Todos">Todos</option>
            {clients.map((client) => (
              <option key={client} value={client}>{client}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="metric-grid" aria-label="Indicadores principales">
        <MetricCard label="Conversaciones" value={fmt.format(totals.CONVERSACIONES)} sub={`${pctFmt.format(ratio(totals.CONVERSACIONES, allTotals.CONVERSACIONES))} del periodo cargado`} />
        <MetricCard label="MQL" value={fmt.format(totals.MQL)} sub={`${pctFmt.format(ratio(totals.MQL, totals.CONVERSACIONES))} de conversaciones`} tone="green" />
        <MetricCard label="SQL" value={fmt.format(totals.SQL)} sub={`${pctFmt.format(sqlRate)} de MQL`} tone={sqlRate < 0.25 ? "orange" : "green"} />
        <MetricCard label="Citas" value={fmt.format(totals.CITAS)} sub={`${pctFmt.format(citaRate)} avance hacia cita`} tone="graphite" />
        <MetricCard label="Firmas" value={fmt.format(totals.FIRMAS)} sub={`${pctFmt.format(firmaRate)} de citas`} tone={totals.FIRMAS === 0 ? "orange" : "green"} />
      </section>

      <section className="analysis-grid">
        <article className="panel funnel-panel">
          <div className="panel-heading">
            <div>
              <p>Embudo filtrado</p>
              <h2>Conversación → firma</h2>
            </div>
            <Target size={22} />
          </div>
          <div className="funnel-list">
            {funnelValues.map((stage, index) => (
              <FunnelStage key={stage.label} label={stage.label} value={stage.value} max={maxFunnel} index={index} />
            ))}
          </div>
          <p className="panel-note">Si una etapa cae a cero, conviene revisar conversación por cliente, seguimiento y agenda.</p>
        </article>

        <article className="panel visual-panel" style={{ backgroundImage: `linear-gradient(180deg, rgba(34,40,38,.72), rgba(34,40,38,.92)), url(${assetUrls.funnel})` }}>
          <div className="visual-panel__content">
            <LineChartIcon />
            <h2>Señal ejecutiva</h2>
            <p>
              {highestRisk ? `${highestRisk.client} aparece como prioridad: ${highestRisk.reason}.` : "No hay bloqueos visibles con el filtro actual."}
            </p>
          </div>
        </article>
      </section>

      <section id="bloqueos" className="panel risk-panel">
        <div className="panel-heading panel-heading--wide">
          <div>
            <p>Prioridad para destrabar</p>
            <h2>Clientes ordenados por riesgo operativo</h2>
          </div>
          <span className="stamp">Actualizar diario</span>
        </div>
        <div className="risk-list">
          {risks.map((risk) => (
            <article key={risk.client} className={`risk-card risk-card--${risk.level.toLowerCase().replace("í", "i")}`}>
              <div className="risk-card__top">
                <div>
                  <span>{risk.level}</span>
                  <h3>{risk.client}</h3>
                </div>
                {risk.level === "Estable" ? <CheckCircle2 /> : <AlertTriangle />}
              </div>
              <p>{risk.reason}</p>
              <div className="risk-card__numbers">
                <span>{fmt.format(risk.conversations)} conv.</span>
                <ArrowRight size={14} />
                <span>{fmt.format(risk.mql)} MQL</span>
                <ArrowRight size={14} />
                <span>{fmt.format(risk.sql)} SQL</span>
                <ArrowRight size={14} />
                <span>{fmt.format(risk.citas)} citas</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="chart-grid">
        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p>Movimiento diario</p>
              <h2>Tendencia de volumen y calidad</h2>
            </div>
            <TrendingUp />
          </div>
          <ResponsiveContainer width="100%" height={290}>
            <AreaChart data={dailyTrend} margin={{ left: -20, right: 10, top: 15, bottom: 0 }}>
              <defs>
                <linearGradient id="convGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#0f5138" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0f5138" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#d8d0c2" strokeDasharray="3 4" />
              <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="CONVERSACIONES" stroke="#26302d" fill="url(#convGradient)" strokeWidth={2} />
              <Line type="monotone" dataKey="MQL" stroke="#0f5138" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="SQL" stroke="#c96528" strokeWidth={2} dot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </article>

        <article className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <p>Comparativo por cliente</p>
              <h2>Volumen vs avance</h2>
            </div>
            <TrendingDown />
          </div>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={clientBars} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="#d8d0c2" strokeDasharray="3 4" horizontal={false} />
              <XAxis type="number" axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="client" width={112} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="CONVERSACIONES" radius={[0, 6, 6, 0]} fill="#26302d" />
              <Bar dataKey="CITAS" radius={[0, 6, 6, 0]} fill="#c96528" />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="panel trajectory-panel" style={{ backgroundImage: `linear-gradient(90deg, rgba(250,247,238,.96), rgba(250,247,238,.78)), url(${assetUrls.trajectory})` }}>
        <div className="panel-heading panel-heading--wide">
          <div>
            <p>Histórico mensual</p>
            <h2>Contexto para saber si el mes actual va sano</h2>
          </div>
          <CalendarDays />
        </div>
        <div className="history-cards">
          {historicalByMonth.map((month) => (
            <article key={month.mes}>
              <span>{month.mes}</span>
              <strong>{fmt.format(month.CITAS)} citas</strong>
              <p>{fmt.format(month.FIRMAS)} firmas · {moneyFmt.format(month.gasto)} gasto</p>
            </article>
          ))}
        </div>
      </section>

      <section id="detalle" className="panel detail-panel">
        <div className="panel-heading panel-heading--wide">
          <div>
            <p>Detalle diario</p>
            <h2>Registros ordenados para seguimiento con Sinahi</h2>
          </div>
          <span className="stamp">{filteredRows.length} filas</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Conv.</th>
                <th>MQL</th>
                <th>SQL</th>
                <th>Citas</th>
                <th>Firmas</th>
                <th>Lectura</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows
                .slice()
                .sort((a, b) => (b.CONVERSACIONES - a.CONVERSACIONES) || a.CLIENTE.localeCompare(b.CLIENTE))
                .map((row, index) => {
                  const weak = row.CONVERSACIONES >= 10 && row.MQL === 0;
                  const stuck = row.MQL > 0 && row.SQL === 0;
                  const noAppointment = row.SQL > 0 && row.CITAS === 0;
                  const note = weak
                    ? "Revisar calificación"
                    : noAppointment
                      ? "Agendar cita"
                      : stuck
                        ? "Mover MQL a SQL"
                        : row.CITAS > 0
                          ? "Dar seguimiento a cita"
                          : "Monitorear";
                  return (
                    <tr key={`${row.FECHA}-${row.CLIENTE}-${index}`}>
                      <td>{formatDate(row.FECHA)}</td>
                      <td>{row.CLIENTE}</td>
                      <td>{fmt.format(row.CONVERSACIONES)}</td>
                      <td>{fmt.format(row.MQL)}</td>
                      <td>{fmt.format(row.SQL)}</td>
                      <td>{fmt.format(row.CITAS)}</td>
                      <td>{fmt.format(row.FIRMAS)}</td>
                      <td><span className={weak || stuck || noAppointment ? "note note--warn" : "note"}>{note}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
