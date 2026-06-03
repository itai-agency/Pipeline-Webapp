/** Compara sumas pipelineData.before.ts vs Excel manual mayo 1-26. */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ts = readFileSync(join(root, "data_backups/rerun_20260507_183624/pipelineData.before.ts"), "utf8");
const json = readFileSync(join(root, "reports/manual_xlsx_analysis.json"), "utf8");
const xlsx = JSON.parse(json).mayo_01_26_daily_sum;

const clients = ["HOGARES", "INQ", "INSPIRA", "GRUPO ELIJO", "DOS HOGARES", "MANOS AL HOGAR"];
const agg: Record<string, { conv: number; mql: number; sql: number; citas: number }> = {};
for (const c of clients) agg[c] = { conv: 0, mql: 0, sql: 0, citas: 0 };

const re = /"FECHA": "2026-05-(\d{2})"[\s\S]*?"CLIENTE": "([^"]+)"[\s\S]*?"CONVERSACIONES": (\d+)[\s\S]*?"MQL": (\d+)[\s\S]*?"SQL": (\d+)[\s\S]*?"CITAS": (\d+)/g;
let m;
while ((m = re.exec(ts))) {
  const day = Number(m[1]);
  if (day > 26) continue;
  const c = m[2];
  if (!agg[c]) continue;
  agg[c].conv += Number(m[3]);
  agg[c].mql += Number(m[4]);
  agg[c].sql += Number(m[5]);
  agg[c].citas += Number(m[6]);
}

console.log("Cliente          | app conv | xlsx conv | app mql | xlsx mql");
for (const c of clients) {
  const a = agg[c];
  const x = xlsx[c] ?? { conv: 0, mql: 0 };
  console.log(
    `${c.padEnd(16)} | ${String(a.conv).padStart(8)} | ${String(x.conv).padStart(9)} | ${String(a.mql).padStart(7)} | ${String(x.mql).padStart(8)}`,
  );
}
