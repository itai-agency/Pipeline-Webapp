import { pipelineData } from '../client/src/lib/pipelineData.ts';
import { metaSpendTotals, metaSpendPeriod } from '../client/src/lib/metaSpendData.ts';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('reports/may10_pipeline_report');
fs.mkdirSync(OUT_DIR, { recursive: true });

const START = '2026-05-01';
const END = '2026-05-10';

const benchmarks = {
  leadToMql: { yellow: 0.17, green: 0.2, label: 'Rojo 0–16% · Amarillo 17–19% · Verde 20%+' },
  mqlToSql: { yellow: 0.65, green: 0.75, label: 'Rojo 0–64% · Amarillo 65–74% · Verde 75%+' },
  sqlToAppointment: { yellow: 0.43, green: 0.52, label: 'Rojo 0–42% · Amarillo 43–51% · Verde 52%+' },
  appointmentToContract: { yellow: 0.101, green: 0.125, label: 'Rojo 0–10% · Amarillo 10.1–12.4% · Verde 12.5%+' },
  costPerLead: { greenMax: 50, yellowMax: 59, label: 'Verde ≤$50 · Amarillo $51–$59 · Rojo $60+' },
};

function ratio(n, d) { return d ? n / d : 0; }
function pct(n) { return `${(n * 100).toFixed(1).replace('.0', '')}%`; }
function money(n) { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n); }
function num(n) { return new Intl.NumberFormat('es-MX').format(n); }
function trafficByRate(value, yellow, green) {
  if (value >= green) return 'Verde';
  if (value >= yellow) return 'Amarillo';
  return 'Rojo';
}
function trafficByCost(value) {
  if (value <= benchmarks.costPerLead.greenMax) return 'Verde';
  if (value <= benchmarks.costPerLead.yellowMax) return 'Amarillo';
  return 'Rojo';
}
function noteFor(row) {
  if (row.CONVERSACIONES >= 10 && row.MQL === 0) return 'Alto volumen con baja calificación MQL; revisar calidad de conversación y criterios MQL.';
  if (row.MQL > 0 && row.SQL === 0) return 'MQL acumulado sin avance a SQL; revisar criterio de calificación y seguimiento comercial.';
  if (row.SQL > 0 && row.CITAS === 0) return 'SQL sin cita; priorizar agendamiento.';
  if (row.CITAS > 0 && row.FIRMAS === 0) return 'Citas sin firma todavía; dar seguimiento post-cita.';
  return 'Flujo sin bloqueo principal detectado; mantener seguimiento.';
}

const rows = pipelineData.daily.filter(r => r.FECHA >= START && r.FECHA <= END);
const spendMap = new Map(metaSpendTotals.map(r => [r.client, r]));
const grouped = new Map();
for (const row of rows) {
  const key = row.CLIENTE;
  if (!grouped.has(key)) grouped.set(key, { client: key, CONVERSACIONES: 0, MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0 });
  const acc = grouped.get(key);
  acc.CONVERSACIONES += row.CONVERSACIONES || 0;
  acc.MQL += row.MQL || 0;
  acc.SQL += row.SQL || 0;
  acc.CITAS += row.CITAS || 0;
  acc.FIRMAS += row.FIRMAS || 0;
}

const clients = Array.from(grouped.values()).map(row => {
  const spendRecord = spendMap.get(row.client);
  const spend = spendRecord?.totalSpend ?? 0;
  const leadToMql = ratio(row.MQL, row.CONVERSACIONES);
  const mqlToSql = ratio(row.SQL, row.MQL);
  const sqlToAppointment = ratio(row.CITAS, row.SQL);
  const appointmentToContract = ratio(row.FIRMAS, row.CITAS);
  const costPerLead = row.CONVERSACIONES > 0 ? spend / row.CONVERSACIONES : 0;
  const costPerAppointment = row.CITAS > 0 ? spend / row.CITAS : null;
  return {
    ...row,
    accountName: spendRecord?.accountName ?? '',
    accountId: spendRecord?.accountId ?? '',
    spend,
    costPerAppointment,
    costPerLead,
    conversions: { leadToMql, mqlToSql, sqlToAppointment, appointmentToContract },
    semaphore: {
      leadToMql: trafficByRate(leadToMql, benchmarks.leadToMql.yellow, benchmarks.leadToMql.green),
      mqlToSql: trafficByRate(mqlToSql, benchmarks.mqlToSql.yellow, benchmarks.mqlToSql.green),
      sqlToAppointment: trafficByRate(sqlToAppointment, benchmarks.sqlToAppointment.yellow, benchmarks.sqlToAppointment.green),
      appointmentToContract: trafficByRate(appointmentToContract, benchmarks.appointmentToContract.yellow, benchmarks.appointmentToContract.green),
      costPerLead: trafficByCost(costPerLead),
    },
    note: noteFor(row),
  };
}).sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES);

const total = clients.reduce((acc, row) => {
  acc.CONVERSACIONES += row.CONVERSACIONES;
  acc.MQL += row.MQL;
  acc.SQL += row.SQL;
  acc.CITAS += row.CITAS;
  acc.FIRMAS += row.FIRMAS;
  acc.spend += row.spend;
  return acc;
}, { CONVERSACIONES: 0, MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0, spend: 0 });
total.costPerAppointment = total.CITAS > 0 ? total.spend / total.CITAS : null;
total.costPerLead = total.CONVERSACIONES > 0 ? total.spend / total.CONVERSACIONES : 0;
total.conversions = {
  leadToMql: ratio(total.MQL, total.CONVERSACIONES),
  mqlToSql: ratio(total.SQL, total.MQL),
  sqlToAppointment: ratio(total.CITAS, total.SQL),
  appointmentToContract: ratio(total.FIRMAS, total.CITAS),
};
total.semaphore = {
  leadToMql: trafficByRate(total.conversions.leadToMql, benchmarks.leadToMql.yellow, benchmarks.leadToMql.green),
  mqlToSql: trafficByRate(total.conversions.mqlToSql, benchmarks.mqlToSql.yellow, benchmarks.mqlToSql.green),
  sqlToAppointment: trafficByRate(total.conversions.sqlToAppointment, benchmarks.sqlToAppointment.yellow, benchmarks.sqlToAppointment.green),
  appointmentToContract: trafficByRate(total.conversions.appointmentToContract, benchmarks.appointmentToContract.yellow, benchmarks.appointmentToContract.green),
  costPerLead: trafficByCost(total.costPerLead),
};

const byDate = {};
for (const row of rows) {
  if (!byDate[row.FECHA]) byDate[row.FECHA] = { FECHA: row.FECHA, CONVERSACIONES: 0, MQL: 0, SQL: 0, CITAS: 0, FIRMAS: 0 };
  byDate[row.FECHA].CONVERSACIONES += row.CONVERSACIONES || 0;
  byDate[row.FECHA].MQL += row.MQL || 0;
  byDate[row.FECHA].SQL += row.SQL || 0;
  byDate[row.FECHA].CITAS += row.CITAS || 0;
  byDate[row.FECHA].FIRMAS += row.FIRMAS || 0;
}

const report = { period: { start: START, end: END, sourceLabel: metaSpendPeriod.sourceLabel, note: metaSpendPeriod.note }, benchmarks, total, clients, byDate: Object.values(byDate).sort((a, b) => a.FECHA.localeCompare(b.FECHA)), formatted: { pct, money, num } };
fs.writeFileSync(path.join(OUT_DIR, 'report_metrics.json'), JSON.stringify(report, null, 2));

const clientCsvHeader = ['Cliente','Cuenta Meta','Conversaciones','MQL','SQL','Citas','Firmas','Inversión','Costo por cita','Leads→MQL','Semáforo Leads→MQL','MQL→SQL','Semáforo MQL→SQL','SQL→Cita','Semáforo SQL→Cita','Cita→Contrato','Semáforo Cita→Contrato','Costo por lead','Semáforo CPL','Lectura'].join(',');
const clientCsvRows = clients.map(c => [
  c.client, c.accountName, c.CONVERSACIONES, c.MQL, c.SQL, c.CITAS, c.FIRMAS, c.spend.toFixed(2), c.costPerAppointment === null ? 'N/A' : c.costPerAppointment.toFixed(2), pct(c.conversions.leadToMql), c.semaphore.leadToMql, pct(c.conversions.mqlToSql), c.semaphore.mqlToSql, pct(c.conversions.sqlToAppointment), c.semaphore.sqlToAppointment, pct(c.conversions.appointmentToContract), c.semaphore.appointmentToContract, c.costPerLead.toFixed(2), c.semaphore.costPerLead, c.note
].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
fs.writeFileSync(path.join(OUT_DIR, 'client_metrics.csv'), [clientCsvHeader, ...clientCsvRows].join('\n'));

console.log(JSON.stringify({ outDir: OUT_DIR, total, clients: clients.length }, null, 2));
