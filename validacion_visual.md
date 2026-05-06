# Validación visual inicial

La webapp carga correctamente en la vista previa con el título **Pipeline Clientes · Sinahi**. Se observa el hero con estética de war room ejecutivo, filtros por fecha y cliente, tarjetas de métricas principales, embudo filtrado, bloque de señal ejecutiva, lista de clientes por riesgo, gráficos y tabla de detalle diario.

Con el filtro inicial del último día disponible, **05/05/2026**, se muestran 6 registros y 6 clientes activos. Métricas visibles: 79 conversaciones, 9 MQL, 2 SQL, 1 cita y 0 firmas. La prioridad de bloqueo inicial detectada aparece sobre **INQ**, por alto volumen de conversaciones con baja calificación MQL.

Pendiente menor: ajustar la lectura de algunas filas para que, si hay SQL sin cita, la nota de detalle lo indique de forma más precisa.

## Segunda validación

Tras el ajuste de lógica, la tabla ahora marca correctamente a **HOGARES** con la acción **Agendar cita** cuando existe SQL sin cita. La vista previa continúa cargando sin errores visibles, conserva los filtros y muestra las métricas iniciales del último día disponible. La compilación TypeScript y el build de producción se ejecutaron correctamente; solo quedó una advertencia de tamaño de chunk propia del bundle de dependencias de gráficos, sin impedir el build.
