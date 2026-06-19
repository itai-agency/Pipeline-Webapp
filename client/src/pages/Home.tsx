/*
 * Filosofía visual: CRM analytics SaaS compacto alineado a Inmoleads.
 * La pantalla debe sentirse como herramienta operativa diaria: tipografía pequeña, tarjetas claras, filtros densos y lectura rápida por cliente/SDR.
 * Pregunta guía: ¿esta interacción ayuda a Sinahi a elegir el siguiente cliente a desbloquear sin convertir la interfaz en presentación?
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutDashboard,
  ListChecks,
  LogOut,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCurrentMonthRange, toAccountDateIso } from "@/lib/dateRanges";
import { stageLabels, type PipelineRow } from "@/lib/pipelineData";
import type { SdrHistoryRow } from "@/lib/sdrHistoryData";
import { useDashboardData } from "@/hooks/useDashboardData";

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
  spend: number;
  costPerAppointment: number | null;
};

type SdrTotals = { CITAS: number; FIRMAS: number };
type GoalStatus = "green" | "yellow" | "red" | "neutral";

type FunnelKpi = {
  key: string;
  label: string;
  value: string;
  benchmark: string;
  progress: number;
  status: GoalStatus;
  statusLabel: string;
  detail: string;
  flowStat?: string;
  rejected?: number;
};

const APP_BUILD_MARKER = import.meta.env.VITE_APP_BUILD_MARKER ?? "embudo-local";

const funnelBenchmarks = {
  leadToMql: { yellow: 0.17, green: 0.2, label: "Rojo 0–16% · Amarillo 17–19% · Verde 20%+" },
  mqlToSql: { yellow: 0.65, green: 0.75, label: "Rojo 0–64% · Amarillo 65–74% · Verde 75%+" },
  sqlToAppointment: { yellow: 0.43, green: 0.52, label: "Rojo 0–42% · Amarillo 43–51% · Verde 52%+" },
  appointmentToContract: { yellow: 0.101, green: 0.125, label: "Rojo 0–10% · Amarillo 10.1–12.4% · Verde 12.5%+" },
  costPerLead: { greenMax: 50, yellowMax: 59, label: "Verde ≤$50 · Amarillo $51–$59 · Rojo $60+" },
};

const fmt = new Intl.NumberFormat("es-MX");
const pctFmt = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

function formatFunnelPct(rate: number): string {
  return pctFmt.format(Math.min(1, Math.max(0, rate)));
}

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

function monthLabel(value: string) {
  const labels: Record<string, string> = {
    "2026-01": "Ene 2026",
    "2026-02": "Feb 2026",
    "2026-03": "Mar 2026",
    "2026-04": "Abr 2026",
    "2026-05": "May 2026",
    ENERO: "Enero",
    FEBRERO: "Febrero",
    MARZO: "Marzo",
    ABRIL: "Abril",
  };
  return labels[value] ?? value;
}

function ratio(numerator: number, denominator: number) {
  return denominator ? numerator / denominator : 0;
}

/** Conversión entre etapas del embudo: la etapa destino no puede superar la origen (máx. 100%). */
function funnelConversionRate(fromStage: number, toStage: number): number {
  if (fromStage <= 0) return 0;
  return Math.min(1, toStage / fromStage);
}

function funnelConvertedCount(fromStage: number, toStage: number): number {
  return Math.min(toStage, fromStage);
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

function monthKey(value?: string | null) {
  return value ? value.slice(0, 7) : "";
}

function trafficByRate(value: number, yellow: number, green: number): GoalStatus {
  if (value >= green) return "green";
  if (value >= yellow) return "yellow";
  return "red";
}

function trafficByCost(value: number | null): GoalStatus {
  if (value === null) return "neutral";
  if (value <= funnelBenchmarks.costPerLead.greenMax) return "green";
  if (value <= funnelBenchmarks.costPerLead.yellowMax) return "yellow";
  return "red";
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function calculateFirmasRitmo(firmasDelMes: number, metaMensual: number, endDate: Date): { cumplimiento: number; firmasEsperadas: number; status: GoalStatus } {
  const diasDelMes = getDaysInMonth(endDate);
  const diaSeleccionado = endDate.getDate();
  const firmasEsperadas = (diaSeleccionado / diasDelMes) * metaMensual;
  const cumplimiento = (firmasDelMes / firmasEsperadas) * 100;
  
  let status: GoalStatus = "red";
  if (cumplimiento >= 100) status = "green";
  else if (cumplimiento >= 85) status = "yellow";
  
  return { cumplimiento, firmasEsperadas, status };
}

function trafficLabel(status: GoalStatus) {
  if (status === "green") return "Verde";
  if (status === "yellow") return "Amarillo";
  if (status === "red") return "Rojo";
  return "Sin dato";
}

function buildFunnelKpis(totals: ReturnType<typeof sumRows>, spend: number | null, currentDate: Date = new Date()): FunnelKpi[] {
  const mqlFromLeads = funnelConvertedCount(totals.CONVERSACIONES, totals.MQL);
  const sqlFromMql = funnelConvertedCount(totals.MQL, totals.SQL);
  const citasFromSql = funnelConvertedCount(totals.SQL, totals.CITAS);
  const firmasFromCitas = funnelConvertedCount(totals.CITAS, totals.FIRMAS);

  const leadToMql = funnelConversionRate(totals.CONVERSACIONES, totals.MQL);
  const mqlToSql = funnelConversionRate(totals.MQL, totals.SQL);
  const sqlToAppointment = funnelConversionRate(totals.SQL, totals.CITAS);
  const appointmentToContract = funnelConversionRate(totals.CITAS, totals.FIRMAS);
  const firmasToMeta = ratio(totals.FIRMAS, 15); // Meta de mayo: 15 firmas
  const costPerLead = spend !== null && totals.CONVERSACIONES > 0 ? spend / totals.CONVERSACIONES : null;
  const firmasRitmo = calculateFirmasRitmo(totals.FIRMAS, 15, currentDate);

  return [
    {
      key: "lead-to-mql",
      label: "Leads → MQL",
      value: formatFunnelPct(leadToMql),
      benchmark: funnelBenchmarks.leadToMql.label,
      progress: Math.min(1, ratio(leadToMql, funnelBenchmarks.leadToMql.green)),
      status: trafficByRate(leadToMql, funnelBenchmarks.leadToMql.yellow, funnelBenchmarks.leadToMql.green),
      statusLabel: trafficLabel(trafficByRate(leadToMql, funnelBenchmarks.leadToMql.yellow, funnelBenchmarks.leadToMql.green)),
      detail: `${fmt.format(mqlFromLeads)} MQL sobre ${fmt.format(totals.CONVERSACIONES)} leads`,
      flowStat: `MQL atribuidos: ${fmt.format(mqlFromLeads)}`,
    },
    {
      key: "mql-to-sql",
      label: "MQL → SQL",
      value: formatFunnelPct(mqlToSql),
      benchmark: funnelBenchmarks.mqlToSql.label,
      progress: Math.min(1, ratio(mqlToSql, funnelBenchmarks.mqlToSql.green)),
      status: trafficByRate(mqlToSql, funnelBenchmarks.mqlToSql.yellow, funnelBenchmarks.mqlToSql.green),
      statusLabel: trafficLabel(trafficByRate(mqlToSql, funnelBenchmarks.mqlToSql.yellow, funnelBenchmarks.mqlToSql.green)),
      detail: `${fmt.format(sqlFromMql)} SQL sobre ${fmt.format(totals.MQL)} MQL`,
      flowStat: `SQL atribuidos: ${fmt.format(sqlFromMql)}`,
    },
    {
      key: "sql-to-appointment",
      label: "SQL → Cita",
      value: formatFunnelPct(sqlToAppointment),
      benchmark: funnelBenchmarks.sqlToAppointment.label,
      progress: Math.min(1, ratio(sqlToAppointment, funnelBenchmarks.sqlToAppointment.green)),
      status: trafficByRate(sqlToAppointment, funnelBenchmarks.sqlToAppointment.yellow, funnelBenchmarks.sqlToAppointment.green),
      statusLabel: trafficLabel(trafficByRate(sqlToAppointment, funnelBenchmarks.sqlToAppointment.yellow, funnelBenchmarks.sqlToAppointment.green)),
      detail: `${fmt.format(citasFromSql)} citas sobre ${fmt.format(totals.SQL)} SQL`,
      flowStat: `Citas atribuidas: ${fmt.format(citasFromSql)}`,
    },
    {
      key: "appointment-to-contract",
      label: "Cita → Contrato",
      value: formatFunnelPct(appointmentToContract),
      benchmark: funnelBenchmarks.appointmentToContract.label,
      progress: Math.min(1, ratio(appointmentToContract, funnelBenchmarks.appointmentToContract.green)),
      status: trafficByRate(appointmentToContract, funnelBenchmarks.appointmentToContract.yellow, funnelBenchmarks.appointmentToContract.green),
      statusLabel: trafficLabel(trafficByRate(appointmentToContract, funnelBenchmarks.appointmentToContract.yellow, funnelBenchmarks.appointmentToContract.green)),
      detail: `${fmt.format(firmasFromCitas)} contratos sobre ${fmt.format(totals.CITAS)} citas`,
      flowStat: `Firmas atribuidas: ${fmt.format(firmasFromCitas)}`,
    },
    {
      key: "firmas-to-meta",
      label: "Firmas → Meta",
      value: pctFmt.format(firmasRitmo.cumplimiento / 100),
      benchmark: `Rojo ≤84% · Amarillo 85–99% · Verde 100%+ (${Math.round(firmasRitmo.firmasEsperadas)} esperadas al día ${currentDate.getDate()})`,
      progress: Math.min(1, firmasRitmo.cumplimiento / 100),
      status: firmasRitmo.status,
      statusLabel: trafficLabel(firmasRitmo.status),
      detail: `${fmt.format(totals.FIRMAS)} firmas sobre ${Math.round(firmasRitmo.firmasEsperadas)} esperadas = ${Math.round(firmasRitmo.cumplimiento)}% cumplimiento`,
    },
    {
      key: "cost-per-lead",
      label: "Costo por Lead",
      value: costPerLead === null ? "Sin dato" : moneyFmt.format(costPerLead),
      benchmark: funnelBenchmarks.costPerLead.label,
      progress: costPerLead === null ? 0 : Math.max(0.06, Math.min(1, funnelBenchmarks.costPerLead.greenMax / Math.max(costPerLead, 1))),
      status: trafficByCost(costPerLead),
      statusLabel: trafficLabel(trafficByCost(costPerLead)),
      detail: spend === null ? "RESPALDO_DIARIO no trae gasto; pendiente cargar inversión" : `${moneyFmt.format(spend)} de inversión sobre ${fmt.format(totals.CONVERSACIONES)} leads`,
    },
  ];
}

function sumSdrRows(rows: SdrHistoryRow[]): SdrTotals {
  return rows.reduce(
    (acc, row) => {
      acc.CITAS += row.CITAS || 0;
      acc.FIRMAS += row.FIRMAS || 0;
      return acc;
    },
    { CITAS: 0, FIRMAS: 0 },
  );
}

function groupByClient(rows: PipelineRow[]) {
  const grouped = new Map<string, PipelineRow[]>();
  rows.forEach((row) => grouped.set(row.CLIENTE, [...(grouped.get(row.CLIENTE) ?? []), row]));
  return Array.from(grouped.entries()).map(([client, clientRows]) => ({ client, ...sumRows(clientRows) }));
}

function sumSpend(rows: readonly { spend: number }[]) {
  return rows.reduce((acc, row) => acc + (row.spend || 0), 0);
}

function spendKey(date?: string | null, client?: string | null) {
  return `${date ?? ""}::${client ?? ""}`;
}

function groupSdr(rows: SdrHistoryRow[], key: "CLIENTE" | "SDR" | "MES" | "FECHA") {
  const grouped = new Map<string, SdrTotals>();
  rows.forEach((row) => {
    const current = grouped.get(row[key]) ?? { CITAS: 0, FIRMAS: 0 };
    current.CITAS += row.CITAS;
    current.FIRMAS += row.FIRMAS;
    grouped.set(row[key], current);
  });
  return Array.from(grouped.entries()).map(([name, totals]) => ({ name, ...totals }));
}

function buildRisks(rows: PipelineRow[], spendByClient = new Map<string, number>()): ClientRisk[] {
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

      const spend = spendByClient.get(row.client) ?? 0;
      const costPerAppointment = row.CITAS > 0 ? spend / row.CITAS : null;

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
        spend,
        costPerAppointment,
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

function SemaforoKpi({ item }: { item: FunnelKpi }) {
  const Icon = item.status === "green" ? CheckCircle2 : item.status === "yellow" ? Clock3 : AlertTriangle;

  return (
    <article className={`traffic-kpi traffic-kpi--${item.status}`}>
      {item.rejected && item.rejected > 0 ? (
        <i className="app-kpi__badge" title={`${item.rejected} leads rechazados que alcanzaron esta etapa como máximo`}>
          ⊘ {item.rejected}
        </i>
      ) : null}
      <div className="traffic-kpi__signal" aria-hidden="true">
        <span className={item.status === "red" ? "active" : ""} />
        <span className={item.status === "yellow" ? "active" : ""} />
        <span className={item.status === "green" ? "active" : ""} />
      </div>
      <div className="traffic-kpi__main">
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.detail}</small>
        {item.flowStat ? (
          <small style={{ fontSize: "0.75rem", color: "#666", marginTop: "4px" }}>📊 {item.flowStat}</small>
        ) : null}
      </div>
      <div className="traffic-kpi__meta">
        <span>Regla de color</span>
        <strong>{item.benchmark}</strong>
        <div className="traffic-kpi__status">
          <Icon size={16} />
          <b>{item.statusLabel}</b>
        </div>
      </div>
      <div className="traffic-kpi__bar" aria-label={`${item.label}: ${Math.round(item.progress * 100)}% contra umbral verde`}>
        <i style={{ width: `${Math.max(6, item.progress * 100)}%` }} />
      </div>
    </article>
  );
}

export default function Home() {
  const { snapshot, loading, error, live, refresh } = useDashboardData();
  const { logout, user, isDevBypass } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    await logout();
    setLocation("/login");
  };
  const daily = snapshot.daily as unknown as PipelineRow[];
  const history = snapshot.daily as unknown as PipelineRow[];
  const sdrRows = snapshot.sdrHistory as unknown as SdrHistoryRow[];
  const metaSpendData = snapshot.metaSpend;
  const metaSpendPeriod = snapshot.metaSpendPeriod;

  const availableDates = useMemo(() => {
    if (snapshot.availableDates?.length) return snapshot.availableDates;
    return Array.from(new Set(daily.map((row) => row.FECHA).filter((date): date is string => Boolean(date)))).sort();
  }, [snapshot.availableDates, daily]);

  const todayIso = toAccountDateIso();
  const defaultMonthRange = getCurrentMonthRange();

  const dataPeriodMin = metaSpendPeriod.start ?? availableDates[0] ?? defaultMonthRange.start;
  const dataPeriodMax = metaSpendPeriod.end ?? availableDates.at(-1) ?? defaultMonthRange.end;
  const pickerMin = availableDates[0] ?? dataPeriodMin;
  const pickerMax = [todayIso, availableDates.at(-1), dataPeriodMax].filter(Boolean).sort().at(-1) ?? todayIso;

  const clients = useMemo(() => {
    const names = new Set<string>();
    daily.forEach((row) => names.add(row.CLIENTE));
    metaSpendData.forEach((row) => names.add(row.client));
    return Array.from(names).sort();
  }, [daily, metaSpendData]);

  const latestDate = todayIso;

  const historicalDates = useMemo(() => Array.from(new Set(sdrRows.map((row) => row.FECHA))).sort(), [sdrRows]);
  const historicalMonths = useMemo(() => Array.from(new Set(sdrRows.map((row) => row.MES))).sort(), [sdrRows]);
  const historicalClients = useMemo(() => Array.from(new Set(sdrRows.map((row) => row.CLIENTE))).sort(), [sdrRows]);
  const historicalSdrs = useMemo(() => Array.from(new Set(sdrRows.map((row) => row.SDR))).sort(), [sdrRows]);

  const [activeTab, setActiveTab] = useState<"diario" | "historico">("diario");
  const [dailyRangeStart, setDailyRangeStart] = useState(() => getCurrentMonthRange().start);
  const [dailyRangeEnd, setDailyRangeEnd] = useState(() => getCurrentMonthRange().end);
  const [selectedClient, setSelectedClient] = useState<string>("Todos");
  const [query, setQuery] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("Todos");
  const [selectedHistoricalDate, setSelectedHistoricalDate] = useState<string>("Todas");
  const [selectedSdr, setSelectedSdr] = useState<string>("Todos");
  const [rangeStart, setRangeStart] = useState(() => getCurrentMonthRange().start);
  const [rangeEnd, setRangeEnd] = useState(() => getCurrentMonthRange().end);
  const lastSyncedAt = useRef<string | null>(null);

  useEffect(() => {
    if (lastSyncedAt.current === snapshot.syncedAt) return;
    lastSyncedAt.current = snapshot.syncedAt;
    const { start, end } = getCurrentMonthRange();
    setDailyRangeStart(start);
    setDailyRangeEnd(end);
    setRangeStart(start);
    setRangeEnd(end);
  }, [snapshot.syncedAt]);

  const timelineDaily = useMemo(
    () => daily.filter((row) => !row.METRICS_SOURCE || row.METRICS_SOURCE === "timeline"),
    [daily],
  );

  const filteredRows = useMemo(() => {
    return timelineDaily.filter((row) => {
      const dateMatch = (!dailyRangeStart || String(row.FECHA) >= dailyRangeStart) && (!dailyRangeEnd || String(row.FECHA) <= dailyRangeEnd);
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());
      return dateMatch && clientMatch && queryMatch;
    });
  }, [timelineDaily, dailyRangeStart, dailyRangeEnd, selectedClient, query]);

  const censusAtEnd = useMemo(() => {
    if (!dailyRangeEnd) return [];
    return daily.filter((row) => {
      if (row.METRICS_SOURCE !== "census" || row.FECHA !== dailyRangeEnd) return false;
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());
      return clientMatch && queryMatch;
    });
  }, [daily, dailyRangeEnd, selectedClient, query]);

  const censusKpisActive = censusAtEnd.length > 0;

  const filteredSpendRows = useMemo(() => {
    return metaSpendData.filter((row) => {
      const dateMatch = (!dailyRangeStart || row.date >= dailyRangeStart) && (!dailyRangeEnd || row.date <= dailyRangeEnd);
      const clientMatch = selectedClient === "Todos" || row.client === selectedClient;
      const queryMatch = !query || row.client.toLowerCase().includes(query.toLowerCase());
      return dateMatch && clientMatch && queryMatch;
    });
  }, [dailyRangeStart, dailyRangeEnd, selectedClient, query]);

  const filteredSdrRows = useMemo(() => {
    return sdrRows.filter((row) => {
      const monthMatch = selectedMonth === "Todos" || row.MES === selectedMonth;
      const dateMatch = selectedHistoricalDate === "Todas" || row.FECHA === selectedHistoricalDate;
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      const sdrMatch = selectedSdr === "Todos" || row.SDR === selectedSdr;
      const rangeMatch = (!rangeStart || row.FECHA >= rangeStart) && (!rangeEnd || row.FECHA <= rangeEnd);
      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase()) || row.SDR.toLowerCase().includes(query.toLowerCase());
      return monthMatch && dateMatch && clientMatch && sdrMatch && rangeMatch && queryMatch;
    });
  }, [sdrRows, selectedMonth, selectedHistoricalDate, selectedClient, selectedSdr, rangeStart, rangeEnd, query]);

  const totals = useMemo(() => {
    if (censusKpisActive) return sumRows(censusAtEnd);
    return sumRows(filteredRows);
  }, [censusKpisActive, censusAtEnd, filteredRows]);
  const rejectedTotals = useMemo(() => {
    const acc = { MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0 };
    for (const row of snapshot.rejectedByStage ?? []) {
      const dateMatch = (!dailyRangeStart || row.FECHA >= dailyRangeStart) && (!dailyRangeEnd || row.FECHA <= dailyRangeEnd);
      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());
      if (!dateMatch || !clientMatch || !queryMatch) continue;
      acc.MQL += row.MQL;
      acc.SQL += row.SQL;
      acc.CITAS += row.CITAS;
      acc.FIRMAS += row.FIRMAS;
    }
    return acc;
  }, [snapshot.rejectedByStage, dailyRangeStart, dailyRangeEnd, selectedClient, query]);
  const spendTotal = useMemo(() => sumSpend(filteredSpendRows), [filteredSpendRows]);
  const metaSpendCoversFilter = useMemo(() => {
    if (!metaSpendPeriod.start || !metaSpendPeriod.end || !dailyRangeStart || !dailyRangeEnd) return true;
    return metaSpendPeriod.start <= dailyRangeStart && metaSpendPeriod.end >= dailyRangeEnd;
  }, [metaSpendPeriod, dailyRangeStart, dailyRangeEnd]);
  const inversionDetail = useMemo(() => {
    const rangeLabel = `${formatDate(metaSpendPeriod.start)}–${formatDate(metaSpendPeriod.end)}`;
    if (!metaSpendCoversFilter && dailyRangeStart && dailyRangeEnd) {
      return `${rangeLabel} · datos Meta incompletos para el filtro activo — ejecuta sync del mes`;
    }
    return `${rangeLabel} · ${metaSpendPeriod.sourceLabel}`;
  }, [metaSpendPeriod, metaSpendCoversFilter, dailyRangeStart, dailyRangeEnd]);
  const spendByClient = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredSpendRows.forEach((row) => grouped.set(row.client, (grouped.get(row.client) ?? 0) + row.spend));
    return grouped;
  }, [filteredSpendRows]);
  const spendByDateClient = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredSpendRows.forEach((row) => grouped.set(spendKey(row.date, row.client), (grouped.get(spendKey(row.date, row.client)) ?? 0) + row.spend));
    return grouped;
  }, [filteredSpendRows]);
  const costPerAppointment = totals.CITAS > 0 ? spendTotal / totals.CITAS : null;
  const endDate = dailyRangeEnd ? new Date(dailyRangeEnd + "T00:00:00") : new Date();
  const funnelKpis = useMemo(() => {
    const kpis = buildFunnelKpis(totals, spendTotal > 0 ? spendTotal : null, endDate);
    const rejectedMap: Record<string, number> = {
      "lead-to-mql": rejectedTotals.MQL,
      "mql-to-sql": rejectedTotals.SQL,
      "sql-to-appointment": rejectedTotals.CITAS,
    };
    return kpis.map((k) => ({ ...k, rejected: rejectedMap[k.key] ?? 0 }));
  }, [totals, spendTotal, endDate, rejectedTotals]);
  const sdrTotals = useMemo(() => sumSdrRows(filteredSdrRows), [filteredSdrRows]);
  const todayRows = useMemo(
    () => timelineDaily.filter((row) => row.FECHA === latestDate),
    [timelineDaily, latestDate],
  );
  const risks = useMemo(() => buildRisks(filteredRows, spendByClient), [filteredRows, spendByClient]);
  const criticalCount = risks.filter((risk) => risk.level !== "Estable").length;
  const clientRows = useMemo(() => {
    if (censusKpisActive) {
      return censusAtEnd
        .map((row) => {
          const spend = spendByClient.get(row.CLIENTE) ?? 0;
          return {
            client: row.CLIENTE,
            CONVERSACIONES: row.CONVERSACIONES,
            MQL: row.MQL,
            SQL: row.SQL,
            CITAS: row.CITAS,
            FIRMAS: row.FIRMAS,
            spend,
            costPerAppointment: row.CITAS > 0 ? spend / row.CITAS : null,
          };
        })
        .sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES);
    }
    return groupByClient(filteredRows)
      .map((row) => {
        const spend = spendByClient.get(row.client) ?? 0;
        return { ...row, spend, costPerAppointment: row.CITAS > 0 ? spend / row.CITAS : null };
      })
      .sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES);
  }, [censusKpisActive, censusAtEnd, filteredRows, spendByClient]);

  const dailyTrend = useMemo(() => {
    return availableDates
      .filter((date) => (!dailyRangeStart || date >= dailyRangeStart) && (!dailyRangeEnd || date <= dailyRangeEnd))
      .map((date) => {
        const rows = timelineDaily.filter((row) => {
          const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;
          const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());
          return row.FECHA === date && clientMatch && queryMatch;
        });
        return { fecha: shortDate(date), ...sumRows(rows) };
      });
  }, [availableDates, timelineDaily, dailyRangeStart, dailyRangeEnd, selectedClient, query]);

  const historicalByMonth = useMemo(() => {
    const months = Array.from(new Set(history.map((row) => row.MES).filter(Boolean)));
    return months.map((month) => {
      const rows = history.filter((row) => row.MES === month);
      const total = sumRows(rows);
      const spend = rows.reduce((acc, row) => acc + (row["GASTO TOTAL"] || 0), 0);
      return { mes: month, ...total, gasto: Math.round(spend) };
    });
  }, [history]);

  const sdrMonthTrend = useMemo(() => groupSdr(filteredSdrRows, "MES").map((row) => ({ ...row, name: monthLabel(row.name) })), [filteredSdrRows]);
  const sdrDateTrend = useMemo(() => groupSdr(filteredSdrRows, "FECHA").map((row) => ({ ...row, name: shortDate(row.name) })), [filteredSdrRows]);
  const sdrClientRanking = useMemo(() => groupSdr(filteredSdrRows, "CLIENTE").sort((a, b) => b.CITAS - a.CITAS), [filteredSdrRows]);
  const sdrRanking = useMemo(() => groupSdr(filteredSdrRows, "SDR").sort((a, b) => b.CITAS - a.CITAS), [filteredSdrRows]);
  const closureRate = ratio(sdrTotals.FIRMAS, sdrTotals.CITAS);

  const funnelValues = Object.entries(stageLabels).map(([key, label]) => ({ label, value: totals[key as keyof typeof totals] ?? 0 }));
  const maxFunnel = Math.max(...funnelValues.map((stage) => stage.value), 1);
  const latestRisk = risks[0];

  return (
    <main className="app-shell">
      <div className="app-shell__nav-column">
        <aside className="app-sidebar">
          <div className="brand-block">
            <div className="brand-mark">IL</div>
            <div>
              <strong>Inmoleads Pipeline</strong>
              <span>Sinahi · operación diaria</span>
            </div>
          </div>
          <nav className="side-nav" aria-label="Navegación del dashboard">
            <button className={activeTab === "diario" ? "active" : ""} onClick={() => setActiveTab("diario")}><LayoutDashboard size={17} /> Diario</button>
            <button className={activeTab === "historico" ? "active" : ""} onClick={() => setActiveTab("historico")}><CalendarDays size={17} /> Histórico</button>
            <a href="#metas"><Target size={17} /> Semáforo</a>
            <a href="#bloqueos"><AlertTriangle size={17} /> Bloqueos</a>
            <a href="#detalle"><ListChecks size={17} /> Detalle</a>
          </nav>
          <div className="sidebar-status">
            <span>Último corte</span>
            <strong>{formatDate(todayIso)}</strong>
            <small>
              {loading ? "Sincronizando…" : `${todayRows.length} registros`}
              {live ? " · en vivo" : ""}
            </small>
            <small>Build {APP_BUILD_MARKER}</small>
            {error ? (
              <small className="table-note table-note--warn">{error}</small>
            ) : null}
            <button type="button" className="sidebar-refresh" onClick={() => void refresh()}>
              Actualizar
            </button>
            {!isDevBypass ? (
              <>
                {user?.email ? (
                  <small className="sidebar-user-email" title={user.email}>
                    {user.email}
                  </small>
                ) : null}
                <button
                  type="button"
                  className="sidebar-logout"
                  onClick={() => void handleLogout()}
                  aria-label="Cerrar sesión"
                >
                  <LogOut size={14} aria-hidden />
                  Cerrar sesión
                </button>
              </>
            ) : null}
          </div>
        </aside>

        <div className="app-mobile-toolbar" role="region" aria-label="Sesión y sincronización">
          <div className="app-mobile-toolbar__primary">
            <span className="app-mobile-toolbar__date">{formatDate(todayIso)}</span>
            <span className="app-mobile-toolbar__sync">
              {loading ? "Sincronizando…" : `${todayRows.length} reg.`}
              {live ? " · en vivo" : ""}
            </span>
            <span className="app-mobile-toolbar__build">Build {APP_BUILD_MARKER}</span>
          </div>
          <div className="app-mobile-toolbar__actions">
            <button
              type="button"
              className="app-mobile-toolbar__btn app-mobile-toolbar__btn--ghost"
              onClick={() => void refresh()}
              aria-label="Actualizar datos"
            >
              <RefreshCw size={16} aria-hidden />
              <span>Actualizar</span>
            </button>
            {!isDevBypass ? (
              <>
                {user?.email ? (
                  <span className="app-mobile-toolbar__email" title={user.email}>
                    {user.email}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="app-mobile-toolbar__btn app-mobile-toolbar__btn--logout"
                  onClick={() => void handleLogout()}
                  aria-label="Cerrar sesión"
                >
                  <LogOut size={16} aria-hidden />
                  <span>Salir</span>
                </button>
              </>
            ) : null}
          </div>
          {error ? <p className="app-mobile-toolbar__error">{error}</p> : null}
        </div>
      </div>

      <section className="app-workspace">
        <header className="app-topbar">
          <div>
            <p>Dashboard operativo</p>
            <h1>{activeTab === "diario" ? "Seguimiento diario del pipeline" : "Histórico SDR de citas y firmas"}</h1>
          </div>
          <div className="topbar-health">
            {activeTab === "diario" ? <Clock3 size={16} /> : <BarChart3 size={16} />}
            <span>{activeTab === "diario" ? `${criticalCount} clientes requieren revisión` : `${fmt.format(filteredSdrRows.length)} registros históricos filtrados`}</span>
          </div>
        </header>

        <section className="tab-switch" aria-label="Pestañas principales">
          <button className={activeTab === "diario" ? "active" : ""} onClick={() => setActiveTab("diario")}>Operación diaria</button>
          <button className={activeTab === "historico" ? "active" : ""} onClick={() => setActiveTab("historico")}>Histórico por fechas</button>
        </section>

        {activeTab === "diario" ? (
          <p className="metrics-hint" style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#5c6b66" }}>
            {censusKpisActive ? (
              <>
                KPIs = <strong>cohorte Kommo API</strong> (leads creados en el mes, etapa actual al {formatDate(dailyRangeEnd)}).
                La gráfica diaria = actividad timeline (movimientos de etapa).
              </>
            ) : (
              <>
                Conversaciones = cohorte Kommo (created_at · America/Mexico_City). MQL/SQL/Citas = etapa actual en timeline. Censo: <code>npm run sync:kommo-snapshot</code>.
              </>
            )}
          </p>
        ) : null}

        <section className="filter-bar" aria-label="Controles de operación">
          <div className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={activeTab === "diario" ? "Buscar cliente" : "Buscar cliente o SDR"} />
          </div>
          {activeTab === "diario" ? (
            <>
              <label>
                Inicio
                <input type="date" min={pickerMin} max={pickerMax} value={dailyRangeStart} onChange={(event) => setDailyRangeStart(event.target.value)} onInput={(event) => setDailyRangeStart(event.currentTarget.value)} />
              </label>
              <label>
                Fin
                <input type="date" min={pickerMin} max={pickerMax} value={dailyRangeEnd} onChange={(event) => setDailyRangeEnd(event.target.value)} onInput={(event) => setDailyRangeEnd(event.currentTarget.value)} />
              </label>
              <label>
                Cliente
                <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
                  <option value="Todos">Todos</option>
                  {clients.map((client) => <option key={client} value={client}>{client}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Mes
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                  <option value="Todos">Todos</option>
                  {historicalMonths.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
                </select>
              </label>
              <label>
                Día
                <select value={selectedHistoricalDate} onChange={(event) => setSelectedHistoricalDate(event.target.value)}>
                  <option value="Todas">Todos</option>
                  {historicalDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
                </select>
              </label>
              <label>
                Cliente
                <select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}>
                  <option value="Todos">Todos</option>
                  {historicalClients.map((client) => <option key={client} value={client}>{client}</option>)}
                </select>
              </label>
              <label>
                SDR
                <select value={selectedSdr} onChange={(event) => setSelectedSdr(event.target.value)}>
                  <option value="Todos">Todos</option>
                  {historicalSdrs.map((sdr) => <option key={sdr} value={sdr}>{sdr}</option>)}
                </select>
              </label>
              <label>
                Desde
                <input type="date" min={pickerMin} max={pickerMax} value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" min={pickerMin} max={pickerMax} value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} />
              </label>
            </>
          )}
        </section>

        {activeTab === "diario" ? (
          <>
            <section className="app-card traffic-panel" id="metas">
              <div className="card-head compact">
                <div>
                  <span>Semáforo de embudo</span>
                  <h2>Color por conversión de etapa</h2>
                </div>
                <Target />
              </div>
              <p className="traffic-panel__intro">
                El color corresponde al semáforo definido para cada paso del embudo. Filtro por defecto: mes en curso ({formatDate(defaultMonthRange.start)}–{formatDate(defaultMonthRange.end)}). Datos sincronizados: {formatDate(dataPeriodMin)}–{formatDate(dataPeriodMax)}. {metaSpendPeriod.note}
              </p>
              <div className="traffic-grid">
                {funnelKpis.map((item) => <SemaforoKpi key={item.key} item={item} />)}
              </div>
            </section>

            <section id="resumen" className="app-grid app-grid--kpis">
              <Kpi
                label={censusKpisActive ? "Leads (cohorte)" : "Transiciones"}
                value={fmt.format(totals.CONVERSACIONES)}
                detail={censusKpisActive ? "Kommo created_at · mes del filtro" : "cambios de etapa · leads creados en el mes"}
              />
              <Kpi
                label="MQL"
                value={fmt.format(totals.MQL)}
                detail={censusKpisActive ? "reached* · etapa actual" : `${pctFmt.format(funnelConversionRate(totals.CONVERSACIONES, totals.MQL))} cohorte creada`}
                tone="good"
              />
              <Kpi label="SQL" value={fmt.format(totals.SQL)} detail={`${pctFmt.format(funnelConversionRate(totals.MQL, totals.SQL))} de MQL`} tone={funnelConversionRate(totals.MQL, totals.SQL) < 0.25 ? "warn" : "good"} />
              <Kpi label="Citas" value={fmt.format(totals.CITAS)} detail={`${pctFmt.format(funnelConversionRate(totals.SQL || totals.MQL, totals.CITAS))} avance`} />
              <Kpi label="Firmas" value={fmt.format(totals.FIRMAS)} detail={`${pctFmt.format(funnelConversionRate(totals.CITAS, totals.FIRMAS))} de citas`} tone={totals.FIRMAS === 0 ? "warn" : "good"} />
              <Kpi
                label="Inversión"
                value={moneyFmt.format(spendTotal)}
                detail={inversionDetail}
                tone={metaSpendCoversFilter ? "good" : "warn"}
              />
              <Kpi label="Costo por cita" value={costPerAppointment === null ? "Sin cita" : moneyFmt.format(costPerAppointment)} detail={`${fmt.format(totals.CITAS)} citas filtradas`} tone={costPerAppointment === null || costPerAppointment > 1800 ? "warn" : "good"} />
            </section>

            {censusAtEnd.length > 0 ? (
              <section className="app-card" style={{ marginBottom: 16 }}>
                <div className="card-head">
                  <div>
                    <span>Censo API</span>
                    <h2>Pipeline al cierre ({formatDate(dailyRangeEnd)})</h2>
                  </div>
                  <ListChecks />
                </div>
                <p style={{ fontSize: "0.85rem", color: "#5c6b66", marginBottom: 12 }}>
                  Censo desde Kommo API (leads creados en el mes del filtro). Comparar con HTML solo en auditoría.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Leads</th>
                        <th>MQL</th>
                        <th>SQL</th>
                        <th>Citas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {censusAtEnd
                        .sort((a, b) => a.CLIENTE.localeCompare(b.CLIENTE))
                        .map((row) => (
                          <tr key={row.CLIENTE}>
                            <td>{row.CLIENTE}</td>
                            <td>{fmt.format(row.CONVERSACIONES)}</td>
                            <td>{fmt.format(row.MQL)}</td>
                            <td>{fmt.format(row.SQL)}</td>
                            <td>{fmt.format(row.CITAS)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

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
                        <stop offset="5%" stopColor="#0f8a5f" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#0f8a5f" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e5eadf" strokeDasharray="3 4" />
                    <XAxis dataKey="fecha" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="CONVERSACIONES" stroke="#173d33" fill="url(#areaConversations)" strokeWidth={2} />
                    <Line type="monotone" dataKey="MQL" stroke="#0f8a5f" strokeWidth={2} />
                    <Line type="monotone" dataKey="SQL" stroke="#f36f21" strokeWidth={2} />
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
                      <small>{fmt.format(risk.conversations)} conv · {fmt.format(risk.citas)} citas · {moneyFmt.format(risk.spend)} · {risk.costPerAppointment === null ? "sin costo/cita" : `${moneyFmt.format(risk.costPerAppointment)}/cita`}</small>
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
                    <CartesianGrid stroke="#e5eadf" strokeDasharray="3 4" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="client" width={110} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="CONVERSACIONES" fill="#173d33" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="CITAS" fill="#f36f21" radius={[0, 5, 5, 0]} />
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
                    <span>{monthLabel(String(month.mes))}</span>
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
                      <th>Inversión</th>
                      <th>Costo/cita</th>
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
                        const rowSpend = spendByDateClient.get(spendKey(row.FECHA, row.CLIENTE)) ?? 0;
                        const rowCostPerAppointment = row.CITAS > 0 ? rowSpend / row.CITAS : null;
                        return (
                          <tr key={`${row.FECHA}-${row.CLIENTE}-${index}`}>
                            <td>{formatDate(row.FECHA)}</td>
                            <td><strong>{row.CLIENTE}</strong></td>
                            <td>{fmt.format(row.CONVERSACIONES)}</td>
                            <td>{fmt.format(row.MQL)}</td>
                            <td>{fmt.format(row.SQL)}</td>
                            <td>{fmt.format(row.CITAS)}</td>
                            <td>{fmt.format(row.FIRMAS)}</td>
                            <td>{moneyFmt.format(rowSpend)}</td>
                            <td>{rowCostPerAppointment === null ? "—" : moneyFmt.format(rowCostPerAppointment)}</td>
                            <td><span className={weak || stuck || noAppointment ? "table-note table-note--warn" : "table-note"}>{note}</span></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="app-grid app-grid--kpis">
              <Kpi label="Citas históricas" value={fmt.format(sdrTotals.CITAS)} detail={`${fmt.format(filteredSdrRows.length)} registros filtrados`} tone="good" />
              <Kpi label="Firmas históricas" value={fmt.format(sdrTotals.FIRMAS)} detail={`${pctFmt.format(closureRate)} cierre sobre citas`} tone={closureRate < 0.08 ? "warn" : "good"} />
              <Kpi label="Clientes" value={fmt.format(sdrClientRanking.length)} detail="con movimiento en filtro" />
              <Kpi label="SDR activos" value={fmt.format(sdrRanking.length)} detail="asignados en histórico" />
              <Kpi label="Rango" value={historicalDates.length ? `${shortDate(rangeStart)}–${shortDate(rangeEnd)}` : "—"} detail="selección temporal" />
            </section>

            <section className="ops-layout history-ops">
              <article className="app-card priority-card">
                <div className="card-head">
                  <div>
                    <span>Lectura histórica</span>
                    <h2>{sdrClientRanking[0]?.name ?? "Sin datos"}</h2>
                  </div>
                  <CheckCircle2 />
                </div>
                <p>{sdrClientRanking[0] ? `${sdrClientRanking[0].name} concentra ${fmt.format(sdrClientRanking[0].CITAS)} citas y ${fmt.format(sdrClientRanking[0].FIRMAS)} firmas en el filtro actual.` : "No hay registros para el filtro seleccionado."}</p>
                <div className="action-strip">
                  <strong>Comparar desempeño por SDR y fecha antes del siguiente seguimiento</strong>
                  <ArrowRight size={18} />
                </div>
              </article>

              <article className="app-card chart-card history-chart">
                <div className="card-head compact">
                  <div>
                    <span>Meses</span>
                    <h2>Citas vs firmas</h2>
                  </div>
                  <TrendingUp />
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={sdrMonthTrend} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e5eadf" strokeDasharray="3 4" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="CITAS" fill="#0f8a5f" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="FIRMAS" fill="#f36f21" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </article>

              <article className="app-card chart-card history-chart">
                <div className="card-head compact">
                  <div>
                    <span>Días</span>
                    <h2>Movimiento por fecha</h2>
                  </div>
                  <CalendarDays />
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={sdrDateTrend} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
                    <CartesianGrid stroke="#e5eadf" strokeDasharray="3 4" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="CITAS" stroke="#0f8a5f" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="FIRMAS" stroke="#f36f21" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </article>
            </section>

            <section className="two-column">
              <article className="app-card">
                <div className="card-head compact">
                  <div>
                    <span>Clientes</span>
                    <h2>Ranking de citas históricas</h2>
                  </div>
                  <Users />
                </div>
                <div className="client-list">
                  {sdrClientRanking.map((row) => (
                    <div className="client-row" key={row.name}>
                      <div>
                        <strong>{row.name}</strong>
                        <span>{pctFmt.format(ratio(row.FIRMAS, row.CITAS))} de firma sobre cita</span>
                      </div>
                      <div className="risk-pill risk-pill--estable">{fmt.format(row.FIRMAS)} firmas</div>
                      <small>{fmt.format(row.CITAS)} citas</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="app-card">
                <div className="card-head compact">
                  <div>
                    <span>SDR</span>
                    <h2>Desempeño por responsable</h2>
                  </div>
                  <ArrowDownRight />
                </div>
                <ResponsiveContainer width="100%" height={310}>
                  <BarChart data={sdrRanking} layout="vertical" margin={{ left: 16, right: 16, top: 4, bottom: 0 }}>
                    <CartesianGrid stroke="#e5eadf" strokeDasharray="3 4" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={92} axisLine={false} tickLine={false} />
                    <Tooltip />
                    <Bar dataKey="CITAS" fill="#173d33" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="FIRMAS" fill="#f36f21" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </article>
            </section>

            <section className="app-card detail-card" id="detalle-historico">
              <div className="card-head compact">
                <div>
                  <span>Detalle histórico</span>
                  <h2>Citas y firmas por día, cliente y SDR</h2>
                </div>
                <Filter />
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Mes</th>
                      <th>Cliente</th>
                      <th>SDR</th>
                      <th>Citas</th>
                      <th>Firmas</th>
                      <th>Lectura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSdrRows
                      .slice()
                      .sort((a, b) => b.FECHA.localeCompare(a.FECHA) || b.CITAS - a.CITAS)
                      .map((row, index) => {
                        const rate = ratio(row.FIRMAS, row.CITAS);
                        const note = row.CITAS > 0 && row.FIRMAS === 0 ? "Cita sin firma" : rate >= 0.2 ? "Buen cierre" : "Monitorear";
                        return (
                          <tr key={`${row.FECHA}-${row.CLIENTE}-${row.SDR}-${index}`}>
                            <td>{formatDate(row.FECHA)}</td>
                            <td>{monthLabel(row.MES)}</td>
                            <td><strong>{row.CLIENTE}</strong></td>
                            <td>{row.SDR}</td>
                            <td>{fmt.format(row.CITAS)}</td>
                            <td>{fmt.format(row.FIRMAS)}</td>
                            <td><span className={row.CITAS > 0 && row.FIRMAS === 0 ? "table-note table-note--warn" : "table-note"}>{note}</span></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
