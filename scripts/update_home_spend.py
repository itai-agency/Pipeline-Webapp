from pathlib import Path

path = Path('/home/ubuntu/pipeline-clientes-sinahi/client/src/pages/Home.tsx')
text = path.read_text()

text = text.replace(
    'import { pipelineData, stageLabels, type PipelineRow } from "@/lib/pipelineData";\nimport { sdrHistoryData, type SdrHistoryRow } from "@/lib/sdrHistoryData";\n',
    'import { pipelineData, stageLabels, type PipelineRow } from "@/lib/pipelineData";\nimport { metaSpendData, metaSpendPeriod } from "@/lib/metaSpendData";\nimport { sdrHistoryData, type SdrHistoryRow } from "@/lib/sdrHistoryData";\n'
)

text = text.replace(
    '  action: string;\n};\n',
    '  action: string;\n  spend: number;\n  costPerAppointment: number | null;\n};\n'
)

text = text.replace(
    'function groupByClient(rows: PipelineRow[]) {\n  const grouped = new Map<string, PipelineRow[]>();\n  rows.forEach((row) => grouped.set(row.CLIENTE, [...(grouped.get(row.CLIENTE) ?? []), row]));\n  return Array.from(grouped.entries()).map(([client, clientRows]) => ({ client, ...sumRows(clientRows) }));\n}\n',
    'function groupByClient(rows: PipelineRow[]) {\n  const grouped = new Map<string, PipelineRow[]>();\n  rows.forEach((row) => grouped.set(row.CLIENTE, [...(grouped.get(row.CLIENTE) ?? []), row]));\n  return Array.from(grouped.entries()).map(([client, clientRows]) => ({ client, ...sumRows(clientRows) }));\n}\n\nfunction sumSpend(rows: readonly { spend: number }[]) {\n  return rows.reduce((acc, row) => acc + (row.spend || 0), 0);\n}\n\nfunction spendKey(date?: string | null, client?: string | null) {\n  return `${date ?? ""}::${client ?? ""}`;\n}\n'
)

text = text.replace(
    'function buildRisks(rows: PipelineRow[]): ClientRisk[] {\n  return groupByClient(rows)\n',
    'function buildRisks(rows: PipelineRow[], spendByClient = new Map<string, number>()): ClientRisk[] {\n  return groupByClient(rows)\n'
)

text = text.replace(
    '      return {\n        client: row.client,\n        conversations: row.CONVERSACIONES,\n        mql: row.MQL,\n        sql: row.SQL,\n        citas: row.CITAS,\n        firmas: row.FIRMAS,\n        score,\n        level,\n        reason,\n        action,\n      };\n',
    '      const spend = spendByClient.get(row.client) ?? 0;\n      const costPerAppointment = row.CITAS > 0 ? spend / row.CITAS : null;\n\n      return {\n        client: row.client,\n        conversations: row.CONVERSACIONES,\n        mql: row.MQL,\n        sql: row.SQL,\n        citas: row.CITAS,\n        firmas: row.FIRMAS,\n        score,\n        level,\n        reason,\n        action,\n        spend,\n        costPerAppointment,\n      };\n'
)

text = text.replace(
    '  const [selectedDate, setSelectedDate] = useState<string>(latestDate);\n  const [selectedClient, setSelectedClient] = useState<string>("Todos");\n',
    '  const [dailyRangeStart, setDailyRangeStart] = useState<string>(availableDates[0] ?? "");\n  const [dailyRangeEnd, setDailyRangeEnd] = useState<string>(latestDate);\n  const [selectedClient, setSelectedClient] = useState<string>("Todos");\n'
)

text = text.replace(
    '  const filteredRows = useMemo(() => {\n    return daily.filter((row) => {\n      const dateMatch = selectedDate === "Todas" || row.FECHA === selectedDate;\n      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;\n      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());\n      return dateMatch && clientMatch && queryMatch;\n    });\n  }, [daily, selectedDate, selectedClient, query]);\n\n  const currentMonthRows = useMemo(() => {\n    const latestMonth = monthKey(latestDate);\n    return daily.filter((row) => {\n      const monthMatch = monthKey(row.FECHA) === latestMonth;\n      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;\n      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());\n      return monthMatch && clientMatch && queryMatch;\n    });\n  }, [daily, latestDate, selectedClient, query]);\n',
    '  const filteredRows = useMemo(() => {\n    return daily.filter((row) => {\n      const dateMatch = (!dailyRangeStart || String(row.FECHA) >= dailyRangeStart) && (!dailyRangeEnd || String(row.FECHA) <= dailyRangeEnd);\n      const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;\n      const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());\n      return dateMatch && clientMatch && queryMatch;\n    });\n  }, [daily, dailyRangeStart, dailyRangeEnd, selectedClient, query]);\n\n  const filteredSpendRows = useMemo(() => {\n    return metaSpendData.filter((row) => {\n      const dateMatch = (!dailyRangeStart || row.date >= dailyRangeStart) && (!dailyRangeEnd || row.date <= dailyRangeEnd);\n      const clientMatch = selectedClient === "Todos" || row.client === selectedClient;\n      const queryMatch = !query || row.client.toLowerCase().includes(query.toLowerCase());\n      return dateMatch && clientMatch && queryMatch;\n    });\n  }, [dailyRangeStart, dailyRangeEnd, selectedClient, query]);\n'
)

text = text.replace(
    '  const totals = useMemo(() => sumRows(filteredRows), [filteredRows]);\n  const currentMonthTotals = useMemo(() => sumRows(currentMonthRows), [currentMonthRows]);\n  const currentMonthSpend = useMemo(() => {\n    const latestMonth = monthKey(latestDate);\n    const spend = history\n      .filter((row) => row.MES === latestMonth)\n      .reduce((acc, row) => acc + (row["GASTO TOTAL"] || 0), 0);\n    return spend > 0 ? spend : null;\n  }, [history, latestDate]);\n  const funnelKpis = useMemo(() => buildFunnelKpis(currentMonthTotals, currentMonthSpend), [currentMonthTotals, currentMonthSpend]);\n',
    '  const totals = useMemo(() => sumRows(filteredRows), [filteredRows]);\n  const spendTotal = useMemo(() => sumSpend(filteredSpendRows), [filteredSpendRows]);\n  const spendByClient = useMemo(() => {\n    const grouped = new Map<string, number>();\n    filteredSpendRows.forEach((row) => grouped.set(row.client, (grouped.get(row.client) ?? 0) + row.spend));\n    return grouped;\n  }, [filteredSpendRows]);\n  const spendByDateClient = useMemo(() => {\n    const grouped = new Map<string, number>();\n    filteredSpendRows.forEach((row) => grouped.set(spendKey(row.date, row.client), (grouped.get(spendKey(row.date, row.client)) ?? 0) + row.spend));\n    return grouped;\n  }, [filteredSpendRows]);\n  const costPerAppointment = totals.CITAS > 0 ? spendTotal / totals.CITAS : null;\n  const funnelKpis = useMemo(() => buildFunnelKpis(totals, spendTotal > 0 ? spendTotal : null), [totals, spendTotal]);\n'
)

text = text.replace(
    '  const risks = useMemo(() => buildRisks(filteredRows), [filteredRows]);\n',
    '  const risks = useMemo(() => buildRisks(filteredRows, spendByClient), [filteredRows, spendByClient]);\n'
)

text = text.replace(
    '  const clientRows = useMemo(() => groupByClient(filteredRows).sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES), [filteredRows]);\n',
    '  const clientRows = useMemo(() => groupByClient(filteredRows).map((row) => {\n    const spend = spendByClient.get(row.client) ?? 0;\n    return { ...row, spend, costPerAppointment: row.CITAS > 0 ? spend / row.CITAS : null };\n  }).sort((a, b) => b.CONVERSACIONES - a.CONVERSACIONES), [filteredRows, spendByClient]);\n'
)

text = text.replace(
    '    return availableDates.map((date) => {\n      const rows = daily.filter((row) => row.FECHA === date);\n      return { fecha: shortDate(date), ...sumRows(rows) };\n    });\n  }, [availableDates, daily]);\n',
    '    return availableDates\n      .filter((date) => (!dailyRangeStart || date >= dailyRangeStart) && (!dailyRangeEnd || date <= dailyRangeEnd))\n      .map((date) => {\n        const rows = daily.filter((row) => {\n          const clientMatch = selectedClient === "Todos" || row.CLIENTE === selectedClient;\n          const queryMatch = !query || row.CLIENTE.toLowerCase().includes(query.toLowerCase());\n          return row.FECHA === date && clientMatch && queryMatch;\n        });\n        return { fecha: shortDate(date), ...sumRows(rows) };\n      });\n  }, [availableDates, daily, dailyRangeStart, dailyRangeEnd, selectedClient, query]);\n'
)

text = text.replace(
    '              <label>\n                Fecha\n                <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>\n                  <option value="Todas">Todas</option>\n                  {availableDates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}\n                </select>\n              </label>\n',
    '              <label>\n                Inicio\n                <input type="date" min={availableDates[0]} max={latestDate} value={dailyRangeStart} onChange={(event) => setDailyRangeStart(event.target.value)} />\n              </label>\n              <label>\n                Fin\n                <input type="date" min={availableDates[0]} max={latestDate} value={dailyRangeEnd} onChange={(event) => setDailyRangeEnd(event.target.value)} />\n              </label>\n'
)

text = text.replace(
    '              <Kpi label="Firmas" value={fmt.format(totals.FIRMAS)} detail={`${pctFmt.format(ratio(totals.FIRMAS, totals.CITAS))} de citas`} tone={totals.FIRMAS === 0 ? "warn" : "good"} />\n',
    '              <Kpi label="Firmas" value={fmt.format(totals.FIRMAS)} detail={`${pctFmt.format(ratio(totals.FIRMAS, totals.CITAS))} de citas`} tone={totals.FIRMAS === 0 ? "warn" : "good"} />\n              <Kpi label="Inversión" value={moneyFmt.format(spendTotal)} detail={metaSpendPeriod.sourceLabel} tone="good" />\n              <Kpi label="Costo por cita" value={costPerAppointment === null ? "Sin cita" : moneyFmt.format(costPerAppointment)} detail={`${fmt.format(totals.CITAS)} citas filtradas`} tone={costPerAppointment === null || costPerAppointment > 1800 ? "warn" : "good"} />\n'
)

text = text.replace(
    '              <p className="traffic-panel__intro">El color corresponde al semáforo definido para cada paso del embudo: Leads→MQL, MQL→SQL, SQL→Cita, Cita→Contrato y Costo por Lead. La lectura se calcula sobre el mes activo más reciente y respeta los rangos de la imagen; si falta gasto, el costo por lead queda marcado como sin dato.</p>\n',
    '              <p className="traffic-panel__intro">El color corresponde al semáforo definido para cada paso del embudo: Leads→MQL, MQL→SQL, SQL→Cita, Cita→Contrato y Costo por Lead. La lectura se calcula con el rango Inicio/Fin activo. {metaSpendPeriod.note}</p>\n'
)

text = text.replace(
    '                      <small>{fmt.format(risk.conversations)} conv · {fmt.format(risk.citas)} citas</small>\n',
    '                      <small>{fmt.format(risk.conversations)} conv · {fmt.format(risk.citas)} citas · {moneyFmt.format(risk.spend)} · {risk.costPerAppointment === null ? "sin costo/cita" : `${moneyFmt.format(risk.costPerAppointment)}/cita`}</small>\n'
)

text = text.replace(
    '                      <th>Firmas</th>\n                      <th>Acción sugerida</th>\n',
    '                      <th>Firmas</th>\n                      <th>Inversión</th>\n                      <th>Costo/cita</th>\n                      <th>Acción sugerida</th>\n'
)

text = text.replace(
    '                        const note = weak ? "Revisar calificación" : noAppointment ? "Agendar cita" : stuck ? "Mover MQL a SQL" : row.CITAS > 0 ? "Seguimiento post-cita" : "Monitorear";\n                        return (\n',
    '                        const note = weak ? "Revisar calificación" : noAppointment ? "Agendar cita" : stuck ? "Mover MQL a SQL" : row.CITAS > 0 ? "Seguimiento post-cita" : "Monitorear";\n                        const rowSpend = spendByDateClient.get(spendKey(row.FECHA, row.CLIENTE)) ?? 0;\n                        const rowCostPerAppointment = row.CITAS > 0 ? rowSpend / row.CITAS : null;\n                        return (\n'
)

text = text.replace(
    '                            <td>{fmt.format(row.FIRMAS)}</td>\n                            <td><span className={weak || stuck || noAppointment ? "table-note table-note--warn" : "table-note"}>{note}</span></td>\n',
    '                            <td>{fmt.format(row.FIRMAS)}</td>\n                            <td>{moneyFmt.format(rowSpend)}</td>\n                            <td>{rowCostPerAppointment === null ? "—" : moneyFmt.format(rowCostPerAppointment)}</td>\n                            <td><span className={weak || stuck || noAppointment ? "table-note table-note--warn" : "table-note"}>{note}</span></td>\n'
)

path.write_text(text)
