import { Router } from "express";
import express from "express";
import { env } from "../config/env.js";
import { processKommoWebhookPayload } from "../services/kommoWebhook.service.js";

export const webhookRouter = Router();

// Acepta JSON y application/x-www-form-urlencoded (Kommo puede enviar ambos)
const urlencodedParser = express.urlencoded({ extended: true });

/**
 * POST /api/webhook/kommo?secret=<KOMMO_WEBHOOK_SECRET>
 *
 * Registro en Kommo: ajustes → webhooks → añadir URL:
 *   https://<tu-servidor>/api/webhook/kommo?secret=<KOMMO_WEBHOOK_SECRET>
 * Eventos a suscribir: "Смена этапа сделки" / "Lead status changed"
 */
webhookRouter.post("/kommo", urlencodedParser, async (req, res, next) => {
  const expectedSecret = env.KOMMO_WEBHOOK_SECRET ?? env.SYNC_API_SECRET;

  if (expectedSecret) {
    const incoming =
      (req.query.secret as string | undefined) ??
      req.headers["x-kommo-webhook-secret"];
    if (incoming !== expectedSecret) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  // Responder 200 inmediatamente para que Kommo no reintente
  res.json({ ok: true });

  try {
    await processKommoWebhookPayload(req.body);
  } catch (err) {
    console.error("[webhook] processKommoWebhookPayload error:", err);
  }
});
