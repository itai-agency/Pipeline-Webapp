import { AlertCircle, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthLinkProblem } from "@/lib/auth/authMessages";
import { authLinkProblemCopy } from "@/lib/auth/authMessages";

type AuthFeedbackPanelProps = {
  problem: AuthLinkProblem;
  onGoLogin: () => void;
  onRetry?: () => void;
};

export function AuthFeedbackPanel({ problem, onGoLogin, onRetry }: AuthFeedbackPanelProps) {
  const copy = authLinkProblemCopy(problem);
  const Icon = copy.tone === "warning" ? AlertCircle : Info;
  const iconWrap =
    copy.tone === "warning"
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : "bg-sky-50 text-sky-700 border-sky-100";

  return (
    <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-6">
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border ${iconWrap}`}
        >
          <Icon className="h-6 w-6 shrink-0" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">{copy.title}</h1>
      </div>

      <ul className="space-y-3 mb-6 text-sm text-slate-600 leading-relaxed list-disc pl-5">
        {copy.body.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 mb-6 text-xs text-slate-500">
        <Clock className="h-4 w-4 shrink-0 mt-0.5" />
        <p>Por seguridad, los enlaces de un solo uso caducan pronto. No es un error del dashboard.</p>
      </div>

      <div className="space-y-2">
        <Button type="button" onClick={onGoLogin} className="w-full bg-slate-900 hover:bg-slate-800 text-white">
          Ir a inicio de sesión
        </Button>
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry} className="w-full">
            Reintentar enlace
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type InlineAuthAlertProps = {
  message: string;
  variant?: "error" | "success" | "info";
};

export function InlineAuthAlert({ message, variant = "error" }: InlineAuthAlertProps) {
  const styles =
    variant === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : variant === "info"
        ? "bg-sky-50 border-sky-200 text-sky-800"
        : "bg-red-50 border-red-200 text-red-600";

  const Icon = variant === "success" ? Info : AlertCircle;

  return (
    <div className={`flex items-start gap-2 p-3 border rounded-md ${styles}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="text-sm leading-relaxed">{message}</p>
    </div>
  );
}
