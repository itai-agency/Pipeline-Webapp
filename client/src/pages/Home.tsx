/*
 * Filosofía visual: webapp operativa de seguimiento diario para pipeline de clientes.
 * La interfaz reduce el efecto presentación y prioriza navegación persistente, controles compactos y decisiones accionables.
 * Pregunta guía: ¿esta pantalla ayuda a Sinahi a saber qué destrabar hoy?
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutDashboard,
  ListChecks,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { pipelineData, stageLabels, type PipelineRow } from "@/lib/pipelineData";

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
  action: string;
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
  return denominator ? numerator / denominator : 0;
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
      let score = 0;
      let reason = "Flujo sin bloqueo principal detectado";
      let action = "Monitorear siguiente corte";

      if (row.CONVERSACIONES >= 20 && mqlRate < 0.12) {
        score = 64;
        reason = "Alto volumen con baja calificación MQL";
        action = "Revisar calidad de conversación y criterios MQL";
      } else if (row.MQL >= 2 && row.SQL === 0) {
        score = 56;
        reason = "MQL acumulado sin avance a SQL";
        action = "Pedir siguiente paso comercial hoy";
      } else if (row.SQL >= 1 && row.CITAS === 0) {
        score = 48;
        reason = "SQL sin cita agendada";
        action = "Agendar cita o confirmar bloqueo";
      } else if (row.CITAS >= 1 && row.FIRMAS === 0) {
        score = 26;
        reason = "Cita sin firma todavía";
        action = "Dar seguimiento post-cita";
      } else if (row.CONVERSACIONES < 5) {
        score = 18;
        reason = "Bajo volumen observado";
        action = "Validar si falta actividad";
      }

      const level: ClientRisk["level"] = score >= 55 ? "Crítico" : score >= 25 ? "Atención" : "Estable";

      return {
        client: row.client,
        conversations: row.CONVERSACIONES,
        mql: row.MQL,
        sql: row.SQL,
        citas: row.CITAS,
        firmas: row.FIRMAS,
        score,
        level,
        reason,
        action,
      };
    })
    .sort((a, b) => b.score - a.score || b.conversations - a.conversations);
}

function Kpi({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <article className={`app-kpi app-kpi--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
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
  const [query, setQuery] = useState<string>("");

  const filteredRows = useMemo(() => {
    return daily.filter((row) => {
      const dateMatch = selectedDate === "Todas" || row.FECHA === selectedDate;
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());
      return dateMatch && clientMatch && queryMatch;
    });
  }, [daily, selectedDate, selectedClient, query]);

  const totals = useMemo(() => sumRows(filteredRows), [filteredRows]);
  const todayRows = useMemo(() => daily.filter((row) => row.FECHA === latestDate), [daily, latestDate]);
  const risks = useMemo(() => buildRisks(selectedDate === "Todas" ? filteredRows : filteredRows), [filteredRows, selectedDate]);
  const criticalCount = risks.filter((risk) => risk.level !== "Estable").length;
  const clientRows = useMemo(() => groupByClient(filteredRows).sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES), [filteredRows]);

  const dailyTrend = useMemo(() => {
    return availableDates.map((date) => {
      const rows = daily.filter((row) => row.FECHA === date);
      return { fecha: shortDate(date), ...sumRows(rows) };
    });
  }, [availableDates, daily]);

  const historicalByMonth = useMemo(() => {
    const months = Array.from(new Set(history.map((row) => row.MES).filter(Boolean)));
    return months.map((month) => {
      const rows = history.filter((row) => row.MES === month);
      const total = sumRows(rows);
      const spend = rows.reduce((acc, row) => acc + (row["GASTO TOTAL"] || 0), 0);
      return { mes: month, ...total, gasto: Math.round(spend) };
    });
  }, [history]);

  const funnelValues = stageLabels.map((stage) => ({ label: stage, value: totals[stage] ?? 0 }));
  const maxFunnel = Math.max(...funnelValues.map((stage) => stage.value), 1);
  const latestRisk = risks[0];

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <div className="brand-mark">PC</div>
          <div>
            <strong>Pipeline Clientes</strong>
            <span>Sinahi · operación diaria</span>
          </div>
        </div>
        <nav className="side-nav" aria-label="Navegación del dashboard">
          <a href="#resumen" className="active"><LayoutDashboard size={17} /> Resumen</a>
          <a href="#bloqueos"><AlertTriangle size={17} /> Bloqueos</a>
          <a href="#clientes"><Users size={17} /> Clientes</a>
          <a href="#detalle"><ListChecks size={17} /> Detalle</a>
        </nav>
        <div className="sidebar-status">
          <span>Último corte</span>
          <strong>{formatDate(latestDate)}</strong>
          <small>{todayRows.length} registros cargados</small>
        </div>
      </aside>

      <section className="app-workspace">
        <header className="app-topbar">
          <div>
            <p>Dashboard operativo</p>
            <h1>Seguimiento diario del pipeline</h1>
          </div>
          <div className="topbar-health">
            <Clock3 size={16} />
            <span>{criticalCount} clientes requieren revisión</span>
          </div>
        </header>

        <section className="filter-bar" aria-label="Controles de operación">
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente" />
          </div>
          <label>
            Fecha
            <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
              <option value="Todas">Todas</option>
              {availableDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
            </select>
          </label>
          <label>
            Cliente
            <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
              <option value="Todos">Todos</option>
              {clients.map((client) => <option key={client} value={client}>{client}</option>)}
            </select>
          </label>
        </section>

        <section id="resumen" className="app-grid app-grid--kpis">
          <Kpi label="Conversaciones" value={fmt.format(totals.CONVERSACIONES)} detail="volumen capturado" />
          <Kpi label="MQL" value={fmt.format(totals.MQL)} detail={`${pctFmt.format(ratio(totals.MQL, totals.CONVERSACIONES))} de conversión`} tone="good" />
          <Kpi label="SQL" value={fmt.format(totals.SQL)} detail={`${pctFmt.format(ratio(totals.SQL, totals.MQL))} de MQL`} tone={ratio(totals.SQL, totals.MQL) < 0.25 ? "warn" : "good"} />
          <Kpi label="Citas" value={fmt.format(totals.CITAS)} detail={`${pctFmt.format(ratio(totals.CITAS, totals.SQL || totals.MQL))} avance`} />
          <Kpi label="Firmas" value={fmt.format(totals.FIRMAS)} detail={`${pctFmt.format(ratio(totals.FIRMAS, totals.CITAS))} de citas`} tone={totals.FIRMAS === 0 ? "warn" : "good"} />
        </section>

        <section className="ops-layout">
          <article className="app-card priority-card" id="bloqueos">
            <div className="card-head">
              <div>
                <span>Próxima acción</span>
                <h2>{latestRisk ? latestRisk.client : "Sin bloqueo"}</h2>
              </div>
              <AlertTriangle />
            </div>
            <p>{latestRisk ? latestRisk.reason : "No hay señales críticas con este filtro."}</p>
            <div className="action-strip">
              <strong>{latestRisk ? latestRisk.action : "Mantener seguimiento"}</strong>
              <ArrowRight size={18} />
            </div>
          </article>

          <article className="app-card funnel-card">
            <div className="card-head compact">
              <div>
                <span>Embudo</span>
                <h2>Etapas filtradas</h2>
              </div>
              <Target />
            </div>
            <div className="mini-funnel">
              {funnelValues.map((stage) => (
                <div key={stage.label}>
                  <div className="mini-funnel__label"><span>{stage.label}</span><strong>{fmt.format(stage.value)}</strong></div>
                  <div className="mini-funnel__track"><i style={{ width: `${Math.max(7, (stage.value / maxFunnel) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </article>

          <article className="app-card chart-card">
            <div className="card-head compact">
              <div>
                <span>Tendencia</span>
                <h2>Movimiento diario</h2>
              </div>
              <TrendingUp />
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={dailyTrend} margin={{ left: -24, right: 8, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f5138" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0f5138" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2ddd2" strokeDasharray="3 4" />
                <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="CONVERSACIONES" stroke="#26302d" fill="url(#areaConversations)" strokeWidth={2} />
                <Line type="monotone" dataKey="MQL" stroke="#0f5138" strokeWidth={2} />
                <Line type="monotone" dataKey="SQL" stroke="#c96528" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </article>
        </section>

        <section className="two-column">
          <article className="app-card" id="clientes">
            <div className="card-head compact">
              <div>
                <span>Clientes</span>
                <h2>Ranking operativo</h2>
              </div>
              <Users />
            </div>
            <div className="client-list">
              {risks.map((risk) => (
                <div className="client-row" key={risk.client}>
                  <div>
                    <strong>{risk.client}</strong>
                    <span>{risk.reason}</span>
                  </div>
                  <div className={`risk-pill risk-pill--${risk.level.toLowerCase().replace("í", "i")}`}>{risk.level}</div>
                  <small>{fmt.format(risk.conversations)} conv · {fmt.format(risk.citas)} citas</small>
                </div>
              ))}
            </div>
          </article>

          <article className="app-card">
            <div className="card-head compact">
              <div>
                <span>Comparativo</span>
                <h2>Volumen por cliente</h2>
              </div>
              <ArrowDownRight />
            </div>
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={clientRows} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="#e2ddd2" strokeDasharray="3 4" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="client" width={110} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="CONVERSACIONES" fill="#26302d" radius={[0, 5, 5, 0]} />
                <Bar dataKey="CITAS" fill="#c96528" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        </section>

        <section className="app-card history-strip">
          <div className="card-head compact">
            <div>
              <span>Histórico mensual</span>
              <h2>Contexto de desempeño</h2>
            </div>
            <CalendarDays />
          </div>
          <div className="month-grid">
            {historicalByMonth.map((month) => (
              <div key={month.mes}>
                <span>{month.mes}</span>
                <strong>{fmt.format(month.CITAS)} citas</strong>
                <small>{fmt.format(month.FIRMAS)} firmas · {moneyFmt.format(month.gasto)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="app-card detail-card" id="detalle">
          <div className="card-head compact">
            <div>
              <span>Detalle accionable</span>
              <h2>Seguimiento diario por cliente</h2>
            </div>
            <Filter />
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Conv.</th>
                  <th>MQL</th>
                  <th>SQL</th>
                  <th>Citas</th>
                  <th>Firmas</th>
                  <th>Acción sugerida</th>
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
                    const note = weak ? "Revisar calificación" : noAppointment ? "Agendar cita" : stuck ? "Mover MQL a SQL" : row.CITAS > 0 ? "Seguimiento post-cita" : "Monitorear";
                    return (
                      <tr key={`${row.FECHA}-${row.CLIENTE}-${index}`}>
                        <td>{formatDate(row.FECHA)}</td>
                        <td><strong>{row.CLIENTE}</strong></td>
                        <td>{fmt.format(row.CONVERSACIONES)}</td>
                        <td>{fmt.format(row.MQL)}</td>
                        <td>{fmt.format(row.SQL)}</td>
                        <td>{fmt.format(row.CITAS)}</td>
                        <td>{fmt.format(row.FIRMAS)}</td>
                        <td><span className={weak || stuck || noAppointment ? "table-note table-note--warn" : "table-note"}>{note}</span></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
