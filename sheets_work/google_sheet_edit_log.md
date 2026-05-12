

## Validación visual parcial del Google Sheet

Se confirmó en la pestaña **MENSUAL** que la fórmula base de consolidación mensual quedó activa desde `A2` y ya derrama registros por mes y cliente, tomando el histórico de `RESPALDO_DIARIO`. También se liberó el rango `B2:G100` para permitir el derrame automático.

Se confirmó en la pestaña **SEMANAL** que el resumen base está conectado desde `A1` con una fórmula `QUERY` sobre `RESPALDO_DIARIO`, agrupando por semana y cliente. Las columnas laterales incluyen cálculos de gasto, costo por cita y semáforos de conversión.


## Validación visual posterior a correcciones de gasto

Se confirmó en la pestaña **SEMANAL** que la fórmula de **GASTO ADS** en H2 está conectada a la tabla auxiliar de inversión en `RESPALDO_DIARIO` y muestra importes distintos de cero por cliente/semana. También se revisó **MENSUAL** en H2; después de corregir la referencia de gasto hacia `RESPALDO_DIARIO!AA:AA`, la columna **GASTO ADS** muestra importes mensuales distintos de cero por cliente, por ejemplo `2,378.06`, `2,991.00`, `4,376.63`, `5,906.62`, `2,900.79` y `7,417.15` en las filas visibles de mayo. Las columnas de conversiones, semáforos y costo por cita permanecen visibles y vinculadas a los datos del histórico.


## Confirmación visual de columnas Ads corregidas

En **RESPALDO_DIARIO**, la celda `J2` quedó con una fórmula `MAP` que cruza `fecha + cliente` contra la tabla auxiliar `Y:AA`, usando específicamente `AA:AA` como columna de **GASTO ADS**. En la vista se observaron valores diarios distintos de cero, como `437.66`, `590.66`, `290.07`, `299.10`, `237.80` y `741.71`, lo que confirma que el gasto diario ya alimenta los cálculos de costo por cita.

En **SEMANAL**, la celda `H2` también quedó con una fórmula `MAP` que suma `RESPALDO_DIARIO!AA:AA` entre `semana` y `semana + 6`, filtrando por cliente. La vista mostró importes semanales distintos de cero, como `237.80`, `299.10`, `437.66`, `590.66`, `290.07`, `741.71`, `1,664.60`, `2,093.70`, `3,063.62`, `4,134.62` y `5,191.97`, confirmando la agregación domingo-sábado.


En **MENSUAL**, la celda `H2` quedó con una fórmula `MAP` que suma `RESPALDO_DIARIO!AA:AA` desde el primer día del mes hasta `FIN.MES(mes,0)`, filtrando por cliente. La vista mensual mostró importes acumulados distintos de cero por cliente, incluyendo `2,378.06`, `2,991.00`, `4,376.63`, `5,906.62`, `2,900.79` y `7,417.15`, además de columnas posteriores de conversión, semáforo y costo por cita calculadas.


## Validación exportada actual

La exportación XLSX confirmó que `RESPALDO_DIARIO` sí contiene la tabla auxiliar de Ads en `Y:AA`, pero las fórmulas guardadas de gasto en `RESPALDO_DIARIO!J2`, `SEMANAL!H2` y `MENSUAL!H2` aún aparecen referenciando `AB:AB` en la exportación, por lo que se debe corregirlas hacia `AA:AA`. Además, `MENSUAL!A1` quedó como valor manual `1` y la fórmula base mensual quedó desplazada; se debe reconstruir la base mensual para que vuelva a quedar conectada al histórico diario.


## Validación final registrada

Se confirmó mediante exportación XLSX actual que `RESPALDO_DIARIO` contiene la tabla auxiliar de gasto Ads en `Y:AA`, con `Y1=FECHA`, `Z1=CLIENTE` y `AA1=GASTO ADS`. También quedó activa la fórmula diaria de gasto en `J2`, apuntando a `AA:AA`, y el costo por cita en `K2` como `gasto / citas`.

En `SEMANAL`, la tabla base está conectada al histórico diario con agrupación por semana y cliente, y la semana se calcula de domingo a sábado. Las columnas calculadas desde `H` incluyen gasto Ads semanal, costo por cita, porcentajes de conversión y semáforos. La fórmula de gasto semanal en `H2` suma `RESPALDO_DIARIO!AA:AA` para fechas entre inicio de semana y seis días posteriores.

En `MENSUAL`, la tabla base quedó reconstruida desde el histórico diario con agrupación por mes y cliente. Las columnas calculadas desde `H` incluyen gasto Ads mensual, costo por cita, porcentajes de conversión y semáforos. La fórmula de gasto mensual en `H2` suma `RESPALDO_DIARIO!AA:AA` para el rango mensual correspondiente.

La validación exportada muestra valores calculados en gasto diario, semanal y mensual, además de fórmulas persistidas en las columnas principales de conversión y semáforo.


## Corrección de formato visual solicitada por usuario

El usuario confirmó que las fórmulas ya funcionan, pero que faltaba corregir la presentación visual: columnas de conversión deben mostrarse como porcentajes legibles, columnas de gasto/costo deben mostrarse como moneda nacional y las columnas nuevas deben conservar colores/estilos consistentes con el archivo original. Se abrió el Google Sheet en la pestaña `RESPALDO_DIARIO`; se observó que `J:GASTO ADS` y `K:COSTO POR CITA` seguían mostrándose como números planos, y que las conversiones requieren formato de porcentaje.

Se inició la corrección seleccionando rangos de formato directamente en Google Sheets, comenzando por `RESPALDO_DIARIO!J:K` para moneda y por las columnas de conversión en `RESPALDO_DIARIO` para porcentaje.


## Formatos visuales aplicados

Se aplicó formato de **moneda** a las columnas `GASTO ADS` y `COSTO POR CITA` en las pestañas `SEMANAL` y `MENSUAL`. También se aplicó formato de **porcentaje** a los bloques de conversiones visibles en esas mismas pestañas, reduciendo decimales para que los indicadores se lean en formato ejecutivo, por ejemplo `25%`, `15%` o `6%`, en lugar de decimales largos.

En `RESPALDO_DIARIO` también se corrigieron las columnas de gasto/costo y el bloque de conversiones/semaforización, evitando la apariencia de número plano en los importes y de decimal extenso en las conversiones.


## Validación parcial en SEMANAL

Se corrigió visualmente `SEMANAL` usando selección directa del cuadro de nombre. Las columnas `H:I` ya muestran importes con símbolo de moneda (`$`) y separadores, y el bloque `J:Q` ya muestra porcentajes sin decimales visibles, por ejemplo `33%`, `40%`, `10%` y `15%`.

## Corrección de formato visual en MENSUAL

Se detectó que el rango real de moneda en `MENSUAL` correspondía a **I:J**: `GASTO ADS` y `COSTO POR CITA`. Se corrigió ese bloque a formato de moneda nacional, con símbolo `$` y separadores. Después se seleccionó **K:R**, donde inicia `% CONV→MQL`, y se dejó con formato de porcentaje sin decimales visibles, de modo que los valores se lean como `0%`, `14%`, `25%`, etc., en lugar de decimales largos.

Queda pendiente validar visualmente `SEMANAL` y `RESPALDO_DIARIO` con esta misma lógica de rangos reales para asegurar que ninguna columna de costo haya quedado como porcentaje.


## Validación visual final de formatos

Se corrigió nuevamente `RESPALDO_DIARIO` con los rangos reales visibles: `J:K` quedó como moneda nacional para `GASTO ADS` y `COSTO POR CITA`, mostrando importes con `$`, separadores y dos decimales. El bloque `L:S`, correspondiente a conversiones y columnas porcentuales posteriores, quedó como porcentaje sin decimales visibles; los valores se leen en formato ejecutivo, por ejemplo `40%`, `33%`, `14%`, `25%`, etc.

Se validó `SEMANAL`: `H:I` conserva formato de moneda y `J:Q` conserva formato porcentual sin decimales. Se validó `MENSUAL`: el gasto visible aparece como moneda nacional con `$` y separadores, y el bloque porcentual fue corregido previamente en `K:R` para mostrarse como porcentaje ejecutivo. Los encabezados y colores de las columnas nuevas quedaron alineados con la estructura visual existente de la hoja.

