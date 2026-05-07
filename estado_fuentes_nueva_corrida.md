# Estado de fuentes para nueva corrida

La hoja principal de pipeline requiere inicio de sesión de Google para exportar el Excel actualizado. Al intentar acceder a la exportación autenticada, Google mostró la pantalla de selección de cuenta con el usuario `evazquez@expertizdigital.com` en estado cerrado de sesión. Por seguridad, no se realizará inicio de sesión sin intervención del usuario.

La fuente histórica SDR sí respondió mediante CSV público desde Google Sheets. El archivo extraído más reciente se guardó en `/home/ubuntu/Downloads/refresh_probe_20260507_183708/sdr_default_gid0.csv` y contiene una estructura de 326 filas por 26 columnas, con la tabla útil en columnas 10 a 16.

Para esta corrida se continuará con la hoja principal local más reciente disponible en Descargas y con el CSV público más reciente del histórico SDR. Si se necesita reflejar cambios nuevos de la hoja principal, será necesario iniciar sesión en Google o subir el Excel/CSV actualizado.
