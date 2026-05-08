# Pendientes para convertir a webapp operativa

- [x] Reducir el hero tipo presentación y reemplazarlo por una barra superior compacta con estado del día.
- [x] Crear un layout de aplicación con sidebar o navegación lateral persistente.
- [x] Hacer que los filtros estén siempre visibles como controles de trabajo, no como bloque decorativo.
- [x] Reordenar la pantalla en módulos funcionales: resumen, bloqueos, clientes, tendencias y detalle.
- [x] Convertir tarjetas grandes en widgets compactos de producto.
- [x] Dar más peso a tabla accionable, ranking de bloqueos y seguimiento por cliente.
- [x] Validar TypeScript, build y vista previa.
- [x] Guardar checkpoint final actualizado.

# Pendientes de rediseño inspirado en plataforma moderna de analytics

- [x] Revisar la referencia de Behance y extraer criterios visuales aplicables.
- [x] Cambiar el lenguaje visual hacia una plataforma SaaS de analytics con más profundidad, contraste y jerarquía.
- [x] Replantear sidebar, topbar, tarjetas y gráficos con un look más moderno y menos administrativo.
- [x] Mejorar densidad visual sin perder claridad operativa para detectar bloqueos.
- [x] Validar TypeScript, build y vista previa.
- [x] Guardar checkpoint final del rediseño.

# Pendientes para actualización histórica y marca Inmoleads

- [x] Acceder al nuevo Google Sheet histórico y descargar/exportar los datos desde enero.
- [x] Revisar www.inmoleads.pro para identificar colores, tipografía y señales visuales de marca.
- [x] Analizar pestañas, columnas y granularidad de la data histórica.
- [x] Normalizar datos por día, mes, cliente y etapa del pipeline para consumo en la webapp.
- [x] Agregar pestaña o sección histórica con filtros por mes, día y rango de fechas.
- [x] Actualizar visualizaciones para que respondan a filtros temporales.
- [x] Aplicar colores de marca de Inmoleads al sistema visual sin perder legibilidad.
- [x] Validar TypeScript, build, datos renderizados y experiencia visual.
- [x] Guardar checkpoint final de la versión con histórico y branding.

# Pendientes para rediseño CRM analytics compacto

- [x] Revisar la nueva referencia de Behance y extraer criterios visuales aplicables.
- [x] Reducir escala tipográfica general: títulos, KPIs y tarjetas deben verse más compactos.
- [x] Cambiar el estilo hacia CRM analytics SaaS moderno, más limpio y menos dramático.
- [x] Ajustar tarjetas, sidebar, filtros y tablas para mayor densidad operativa.
- [x] Mantener pestaña histórica, filtros por fecha, cliente y SDR sin pérdida funcional.
- [x] Validar TypeScript, build y vista previa del nuevo diseño compacto.
- [x] Guardar checkpoint final del rediseño CRM compacto.

# Pendientes para refrescar data actualizada

- [x] Identificar la fuente de datos y scripts actuales usados por el dashboard.
- [x] Descargar o extraer la versión más reciente de la data real disponible localmente.
- [x] Normalizar registros diarios e históricos sin inventar datos.
- [x] Integrar la data renovada en el frontend conservando filtros y diseño compacto.
- [x] Validar TypeScript, build y vista previa con los nuevos totales.
- [x] Guardar checkpoint final con data refrescada.

# Continuación de actualización de data

- [x] Verificar si existen archivos Excel/CSV nuevos en Descargas o en la carpeta de actualización.
- [x] Confirmar que los archivos disponibles sean válidos y más recientes que la versión integrada.
- [x] Ejecutar normalización de pipeline principal e histórico SDR con las fuentes accesibles.
- [x] Comparar metadatos antes/después: registros, rango de fechas, clientes, citas y firmas.
- [x] Validar build y navegación de vistas diaria e histórica.
- [x] Guardar checkpoint con la data refrescada o documentar limitación si no hay fuente nueva válida.

# Nueva corrida de data actualizada

- [x] Revisar si las fuentes Excel/CSV en Descargas fueron actualizadas nuevamente.
- [x] Respaldar metadatos actuales antes de regenerar para comparar cambios.
- [x] Reejecutar normalización de pipeline principal e histórico SDR.
- [x] Comparar totales y rangos de fecha contra la versión b12dc6b6.
- [x] Validar TypeScript, build y navegación diaria/histórica.
- [x] Guardar nuevo checkpoint si hay cambios o documentar que no hubo cambios en la fuente.

# Verificación de corte 06/05/2026

- [x] Confirmar si `pipelineData.ts` contiene registros del 06/05/2026: no contiene registros de esa fecha.
- [x] Revisar archivos Excel/CSV disponibles para detectar filas con fecha 06/05/2026: no aparece en las fuentes locales accesibles.
- [x] Determinar si la ausencia del 06/05/2026 se debe a fuente local desactualizada o a filtro/normalización: la fuente diaria local llega solo al 05/05/2026 y Google Sheets requiere acceso autenticado.
- [x] Actualizar la data con la fuente autenticada que contiene corte 06/05/2026.
- [x] Validar dashboard con corte corregido; queda pendiente registrar checkpoint final.

# Fuente confirmada Google Sheets gid 135221143

- [x] Usar como fuente principal el documento `1K-TdH3tk02Lu2i9zHGfXT7T2j691nANNzpQB8Fx_OxQ` con `gid=135221143`.
- [x] Probar extracción directa de la pestaña confirmada por CSV/XLSX: devuelve pantalla de login, no datos exportables sin iniciar sesión.
- [x] Confirmar si la pestaña confirmada contiene registros del 06/05/2026: 6 filas reales en RESPALDO_DIARIO.
- [x] Adaptar normalización para la descarga autenticada Excel de la pestaña RESPALDO_DIARIO.
- [x] Actualizar dashboard y validar build con la data accesible del 06/05/2026; queda pendiente registrar checkpoint final.

# Nueva corrida desde Google Sheets actualizado

- [ ] Abrir la URL confirmada del Google Sheet `1K-TdH3tk02Lu2i9zHGfXT7T2j691nANNzpQB8Fx_OxQ` con `gid=135221143`.
- [x] Descargar o reutilizar una exportación autenticada más reciente que la versión integrada: solo hay archivo local del 07/05/2026 con filas nuevas en cero.
- [x] Validar hojas, rango de fechas, clientes y totales antes de modificar el frontend: no hay métricas nuevas válidas disponibles localmente.
- [x] Regenerar `pipelineData.ts` sin alterar diseño, filtros ni vista histórica: corte 07/05/2026 integrado con 62 conversaciones, 4 MQL, 2 SQL, 2 citas y 0 firmas.
- [x] Validar TypeScript, build y navegación diaria/histórica.
- [ ] Guardar checkpoint final y reportar el nuevo corte integrado.

# Manejo de sesión expirada y alternativas sin nuevo login

- [x] Verificar si Google Sheets puede exportarse por URL directa sin sesión activa: devuelve HTTP 401 y HTML de login.
- [x] Inspeccionar Descargas para encontrar exportaciones más recientes del documento confirmado: solo existe la exportación del 07/05/2026 23:02.
- [x] Comparar fecha de modificación, hojas y último corte contra la versión integrada `7e4ada97`: la exportación local trae filas 07/05/2026, pero todas sus métricas están en cero.
- [x] Usar la exportación local más reciente si contiene datos nuevos válidos: la primera local estaba en cero, pero la descarga autenticada reactivada contiene métricas reales al 07/05/2026.
- [x] Pedir intervención del usuario solo si no existe ninguna fuente accesible y Google mantiene la sesión cerrada: se reactivó la sesión sin credenciales por chat.
