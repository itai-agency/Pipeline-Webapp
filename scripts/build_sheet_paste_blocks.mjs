import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('sheets_work/paste_blocks');
fs.mkdirSync(outDir, { recursive: true });

const dates = [
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
  '2026-05-06','2026-05-07','2026-05-08','2026-05-09','2026-05-10',
];
const accounts = [
  { client: 'DOS HOGARES', accountName: 'IIHogares GDL CP', accountId: 'act_2175146543225091', totalSpend: 2378.06 },
  { client: 'GRUPO ELIJO', accountName: 'GRUPO ELIJO CP', accountId: 'act_864948876563125', totalSpend: 2991.03 },
  { client: 'HOGARES', accountName: 'CInmubles Bajio', accountId: 'act_349294690945338', totalSpend: 4376.63 },
  { client: 'INQ', accountName: 'inq inmobiliaria cp', accountId: 'act_1584938395981836', totalSpend: 5906.62 },
  { client: 'INSPIRA', accountName: 'Inspira Bienes Raices CP', accountId: 'act_949679304398951', totalSpend: 2900.79 },
  { client: 'MANOS AL HOGAR', accountName: 'Manos al hogar Publicidad', accountId: 'act_1581946449839805', totalSpend: 7417.15 },
];
function allocate(total, i) {
  const base = Math.floor((total / dates.length) * 100) / 100;
  return i < dates.length - 1 ? base : Number((total - base * (dates.length - 1)).toFixed(2));
}
const adsRows = [
  ['FECHA','CLIENTE','GASTO ADS','CUENTA META','ID CUENTA','FUENTE'],
  ...accounts.flatMap(a => dates.map((date, i) => [date, a.client, allocate(a.totalSpend, i).toFixed(2), a.accountName, a.accountId, 'Meta Ads confirmado 01-10 mayo 2026 · prorrateo diario']))
];
fs.writeFileSync(path.join(outDir, 'respaldo_ads_y1.tsv'), adsRows.map(r => r.join('\t')).join('\n'));

const diario = [
  ['MES','GASTO ADS','COSTO POR CITA','% CONV→MQL','SEMÁFORO CONV→MQL','% MQL→SQL','SEMÁFORO MQL→SQL','% SQL→CITA','SEMÁFORO SQL→CITA','% CITA→FIRMA','SEMÁFORO CITA→FIRMA','COSTO POR LEAD','SEMÁFORO CPL','SEMÁFORO GENERAL','LECTURA'],
  [
    '=ARRAYFORMULA(IF(A2:A="",,EOMONTH(A2:A,0)))',
    '=MAP(A2:A,B2:B,LAMBDA(fecha,cliente,IF(fecha="",,IFERROR(SUMIFS($AA:$AA,$Y:$Y,fecha,$Z:$Z,cliente),0))))',
    '=MAP(J2:J,F2:F,LAMBDA(g,c,IF(c>0,g/c,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(D2:D/C2:C,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(L2:L>=0.2,"Verde",IF(L2:L>=0.17,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(E2:E/D2:D,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(N2:N>=0.75,"Verde",IF(N2:N>=0.65,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(F2:F/E2:E,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(P2:P>=0.52,"Verde",IF(P2:P>=0.43,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(G2:G/F2:F,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(R2:R>=0.125,"Verde",IF(R2:R>=0.101,"Amarillo","Rojo"))))',
    '=MAP(J2:J,C2:C,LAMBDA(g,leads,IF(leads>0,g/leads,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(T2:T<=50,"Verde",IF(T2:T<=59,"Amarillo","Rojo"))))',
    '=MAP(M2:M,O2:O,Q2:Q,S2:S,U2:U,LAMBDA(a,b,c,d,e,IF(a="",,IF(COUNTIF({a,b,c,d,e},"Rojo")>0,"Rojo",IF(COUNTIF({a,b,c,d,e},"Amarillo")>0,"Amarillo","Verde")))))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(V2:V="Rojo","Revisar prioridad del día",IF(V2:V="Amarillo","Optimizar seguimiento","Buen desempeño"))))',
  ]
];
fs.writeFileSync(path.join(outDir, 'respaldo_calculos_i1.tsv'), diario.map(r => r.join('\t')).join('\n'));

const semanal = [
  ['GASTO ADS','COSTO POR CITA','% CONV→MQL','SEMÁFORO CONV→MQL','% MQL→SQL','SEMÁFORO MQL→SQL','% SQL→CITA','SEMÁFORO SQL→CITA','% CITA→FIRMA','SEMÁFORO CITA→FIRMA','COSTO POR LEAD','SEMÁFORO CPL','SEMÁFORO GENERAL','INICIO SEMANA','FIN SEMANA'],
  [
    '=MAP(A2:A,B2:B,LAMBDA(sem,cliente,IF(sem="",,IFERROR(SUMIFS(RESPALDO_DIARIO!$AA:$AA,RESPALDO_DIARIO!$Y:$Y,">="&sem,RESPALDO_DIARIO!$Y:$Y,"<="&sem+6,RESPALDO_DIARIO!$Z:$Z,cliente),0))))',
    '=MAP(H2:H,F2:F,LAMBDA(g,c,IF(c>0,g/c,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(D2:D/C2:C,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(J2:J>=0.2,"Verde",IF(J2:J>=0.17,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(E2:E/D2:D,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(L2:L>=0.75,"Verde",IF(L2:L>=0.65,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(F2:F/E2:E,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(N2:N>=0.52,"Verde",IF(N2:N>=0.43,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(G2:G/F2:F,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(P2:P>=0.125,"Verde",IF(P2:P>=0.101,"Amarillo","Rojo"))))',
    '=MAP(H2:H,C2:C,LAMBDA(g,leads,IF(leads>0,g/leads,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(R2:R<=50,"Verde",IF(R2:R<=59,"Amarillo","Rojo"))))',
    '=MAP(K2:K,M2:M,O2:O,Q2:Q,S2:S,LAMBDA(a,b,c,d,e,IF(a="",,IF(COUNTIF({a,b,c,d,e},"Rojo")>0,"Rojo",IF(COUNTIF({a,b,c,d,e},"Amarillo")>0,"Amarillo","Verde")))))',
    '=ARRAYFORMULA(IF(A2:A="",,A2:A))',
    '=ARRAYFORMULA(IF(A2:A="",,A2:A+6))',
  ]
];
fs.writeFileSync(path.join(outDir, 'semanal_calculos_h1.tsv'), semanal.map(r => r.join('\t')).join('\n'));

const mensual = [
  ['GASTO ADS','COSTO POR CITA','% CONV→MQL','SEMÁFORO CONV→MQL','% MQL→SQL','SEMÁFORO MQL→SQL','% SQL→CITA','SEMÁFORO SQL→CITA','% CITA→FIRMA','SEMÁFORO CITA→FIRMA','COSTO POR LEAD','SEMÁFORO CPL','SEMÁFORO GENERAL','INICIO MES','FIN MES'],
  [
    '=MAP(A2:A,B2:B,LAMBDA(mes,cliente,IF(mes="",,IFERROR(SUMIFS(RESPALDO_DIARIO!$AA:$AA,RESPALDO_DIARIO!$Y:$Y,">="&mes,RESPALDO_DIARIO!$Y:$Y,"<="&EOMONTH(mes,0),RESPALDO_DIARIO!$Z:$Z,cliente),0))))',
    '=MAP(H2:H,F2:F,LAMBDA(g,c,IF(c>0,g/c,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(D2:D/C2:C,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(J2:J>=0.2,"Verde",IF(J2:J>=0.17,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(E2:E/D2:D,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(L2:L>=0.75,"Verde",IF(L2:L>=0.65,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(F2:F/E2:E,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(N2:N>=0.52,"Verde",IF(N2:N>=0.43,"Amarillo","Rojo"))))',
    '=ARRAYFORMULA(IF(A2:A="",,IFERROR(G2:G/F2:F,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(P2:P>=0.125,"Verde",IF(P2:P>=0.101,"Amarillo","Rojo"))))',
    '=MAP(H2:H,C2:C,LAMBDA(g,leads,IF(leads>0,g/leads,0)))',
    '=ARRAYFORMULA(IF(A2:A="",,IF(R2:R<=50,"Verde",IF(R2:R<=59,"Amarillo","Rojo"))))',
    '=MAP(K2:K,M2:M,O2:O,Q2:Q,S2:S,LAMBDA(a,b,c,d,e,IF(a="",,IF(COUNTIF({a,b,c,d,e},"Rojo")>0,"Rojo",IF(COUNTIF({a,b,c,d,e},"Amarillo")>0,"Amarillo","Verde")))))',
    '=ARRAYFORMULA(IF(A2:A="",,A2:A))',
    '=ARRAYFORMULA(IF(A2:A="",,EOMONTH(A2:A,0)))',
  ]
];
fs.writeFileSync(path.join(outDir, 'mensual_calculos_h1.tsv'), mensual.map(r => r.join('\t')).join('\n'));

console.log(JSON.stringify({ outDir, files: fs.readdirSync(outDir) }, null, 2));
