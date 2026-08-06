"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button, Label } from "@arkiteq/ui";
import { createClient } from "@/lib/supabase/client";
import { APP_HOME } from "@/lib/site";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

/**
 * Cambia la contraseña usando la sesión de recuperación que ya dejó activa
 * `/auth/callback` (no pide la contraseña anterior — así funciona el enlace
 * de recuperación de Supabase: la sesión temporal autoriza el cambio).
 */
export function RestablecerClaveForm() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState(false);

  const passwordOk = password.length >= 8;
  const confirmTocado = confirmar.length > 0;
  const confirmOk = confirmTocado && confirmar === password;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordOk) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!confirmOk) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(
        "No se pudo cambiar la contraseña. El enlace puede haber vencido — pide uno nuevo e inténtalo otra vez.",
      );
      return;
    }

    setExito(true);
    setTimeout(() => router.push(APP_HOME), 1800);
  }

  if (exito) {
    return (
      <div
        role="status"
        className="border-success/30 bg-success/10 text-foreground flex items-start gap-3 rounded-lg border p-4 text-sm"
      >
        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
        <p>Contraseña actualizada. Entrando a tu cuenta…</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      {error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          required
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmar">Confirmar contraseña</Label>
        <PasswordInput
          id="confirmar"
          name="confirmar"
          autoComplete="new-password"
          placeholder="Repite tu contraseña"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          disabled={pending}
          required
        />
        {confirmTocado && !confirmOk ? (
          <p className="text-danger text-xs">Las contraseñas no coinciden.</p>
        ) : null}
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!passwordOk || !confirmOk || pending}
        aria-busy={pending}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Guardando…" : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
