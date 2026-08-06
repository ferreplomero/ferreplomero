"use client";

import * as React from "react";
import { AlertCircle, CheckCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button, Card, Label } from "@arkiteq/ui";
import { createClient } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";

interface CambiarPasswordFormProps {
  /** Correo de la cuenta con sesión activa — se usa solo para reautenticar y
   * confirmar la contraseña actual, nunca se muestra ni se modifica aquí. */
  email: string;
}

/**
 * Cambia la contraseña del usuario con sesión activa. Verifica la actual
 * reautenticando con `signInWithPassword` (Supabase no tiene un endpoint
 * separado de "solo verificar"; esta es la forma correcta y recomendada de
 * confirmar la clave vigente sin tocar nada por SQL) y, si es correcta,
 * aplica la nueva con `auth.updateUser({ password })` — el único método
 * válido para cambiar la contraseña del usuario en sesión. Ninguna de las
 * dos llamadas cierra la sesión: el usuario sigue autenticado después.
 */
export function CambiarPasswordForm({ email }: CambiarPasswordFormProps) {
  const [actual, setActual] = React.useState("");
  const [nueva, setNueva] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState(false);

  const nuevaOk = nueva.length >= 8;
  const confirmTocado = confirmar.length > 0;
  const confirmOk = confirmTocado && confirmar === nueva;
  const formValido = actual.length > 0 && nuevaOk && confirmOk;

  function limpiar() {
    setActual("");
    setNueva("");
    setConfirmar("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(false);

    if (!actual) {
      setError("Ingresa tu contraseña actual.");
      return;
    }
    if (!nuevaOk) {
      setError("La contraseña nueva debe tener al menos 8 caracteres.");
      return;
    }
    if (!confirmOk) {
      setError("La confirmación no coincide con la contraseña nueva.");
      return;
    }
    if (nueva === actual) {
      setError("La contraseña nueva debe ser distinta de la actual.");
      return;
    }

    setPending(true);
    const supabase = createClient();

    // Verifica la contraseña actual reautenticando — si es incorrecta, esto
    // falla y no se llega a cambiar nada.
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: actual,
    });
    if (authError) {
      setPending(false);
      setError("La contraseña actual no es correcta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: nueva });
    setPending(false);

    if (updateError) {
      setError("No se pudo actualizar la contraseña. Inténtalo de nuevo.");
      return;
    }

    setExito(true);
    limpiar();
  }

  return (
    <Card className="space-y-5 p-6">
      {exito ? (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="size-4 shrink-0" aria-hidden />
          Contraseña actualizada correctamente.
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <form onSubmit={enviar} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="password-actual">Contraseña actual</Label>
          <PasswordInput
            id="password-actual"
            name="password-actual"
            autoComplete="current-password"
            placeholder="Tu contraseña actual"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            disabled={pending}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password-nueva">Nueva contraseña</Label>
          <PasswordInput
            id="password-nueva"
            name="password-nueva"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            disabled={pending}
            required
          />
          <PasswordStrengthMeter password={nueva} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password-confirmar">Confirmar nueva contraseña</Label>
          <PasswordInput
            id="password-confirmar"
            name="password-confirmar"
            autoComplete="new-password"
            placeholder="Repite la contraseña nueva"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            disabled={pending}
            required
          />
          {confirmTocado ? (
            confirmOk ? (
              <p className="text-success flex items-center gap-1.5 text-xs font-medium">
                <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
                Las contraseñas coinciden.
              </p>
            ) : (
              <p className="text-danger flex items-center gap-1.5 text-xs font-medium">
                <XCircle className="size-3.5 shrink-0" aria-hidden />
                Las contraseñas no coinciden.
              </p>
            )
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !formValido}>
            {pending ? "Actualizando…" : "Actualizar contraseña"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
