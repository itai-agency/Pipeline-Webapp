# Diagnóstico del corte 06/05/2026

La data integrada del dashboard no está actualizada hasta el 06/05/2026. La revisión directa de `client/src/lib/pipelineData.ts` confirmó que las fechas disponibles para la operación diaria son `2026-05-01`, `2026-05-02`, `2026-05-04` y `2026-05-05`; no existe ningún registro integrado con `2026-05-06`.

La fuente Excel local principal ubicada en `/home/ubuntu/Downloads/1K-TdH3tk02Lu2i9zHGfXT7T2j691nANNzpQB8Fx_OxQ.xlsx` tampoco contiene el corte del 06/05/2026. Ese archivo tiene como fecha máxima detectada `2026-05-05`, con hojas `RESPALDO_DIARIO` y `SEMANAL`. Por eso, aunque se volvió a correr la normalización, el dashboard siguió mostrando último corte `05/05/2026`.

Los intentos de extraer CSV público de la hoja principal devolvieron HTML de inicio de sesión de Google, no datos reales. El histórico SDR accesible por CSV público llega hasta `20/04/2026`, por lo que tampoco aporta datos del 06/05/2026 para la vista diaria.

| Fuente revisada | Estado | Fecha máxima detectada | Contiene 06/05/2026 |
|---|---:|---:|---:|
| `client/src/lib/pipelineData.ts` | Data integrada actual | 2026-05-05 | No |
| Excel principal `1K-TdH3...xlsx` | Fuente local usada para regenerar | 2026-05-05 | No |
| CSV extraído de hoja principal | No usable; devuelve login HTML | Sin fecha válida | No |
| CSV público histórico SDR | Usable para histórico SDR | 2026-04-20 | No |

Conclusión: la ausencia del 06/05/2026 no se debe a un error visual ni a un filtro del dashboard. Se debe a que la fuente diaria local accesible está desactualizada y Google Sheets requiere sesión/autorización para descargar la versión más reciente.
