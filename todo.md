# Tareas pendientes

## Dashboard
- [ ] Mostrar decimales en métricas y gasto (p. ej. `minimumFractionDigits: 2` en `Intl.NumberFormat` en `Home.tsx` y componentes relacionados).

## Kommo
- [ ] Ejecutar `npm run kommo:discover` y validar `KOMMO_CLIENT_MAP` / `KOMMO_STATUS_MAP` contra etapas reales.
- [ ] Ejecutar `npm run sync:kommo` y verificar conteos en el dashboard.

## Discusión con jefe (métricas vs hoja histórica)
- [ ] Alinear criterio de conteo Kommo con la hoja histórica (Google Sheet): hoy el sync usa leads **actualizados** en el mes con etapa **actual** (Rechazado = 0). La hoja parece reflejar conteos diarios distintos (posiblemente nuevos leads, snapshot de pipeline o reglas manuales). Definir fuente de verdad operativa antes de cambiar la lógica de sync.
