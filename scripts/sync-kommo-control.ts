/**
 * @deprecated Solo auditoría. El dashboard NO debe escribir el HTML en BD.
 * Usa: npm run sync:kommo-snapshot
 */
console.error(
  "sync:kommo-control está deshabilitado. El censo viene de la API Kommo (cohorte created_at).\n" +
    "Ejecuta: npm run sync:kommo-snapshot",
);
process.exit(1);
