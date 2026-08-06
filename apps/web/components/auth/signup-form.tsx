"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Input, Label } from "@arkiteq/ui";
import { signUpAction, type AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "./submit-button";
import { PasswordInput } from "./password-input";
import { PasswordStrengthMeter } from "./password-strength-meter";

const INITIAL: AuthState = {};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^[+]?[\d\s()-]{7,20}$/;

function whatsappValido(v: string): boolean {
  return WHATSAPP_RE.test(v.trim()) && v.replace(/\D/g, "").length >= 10;
}

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, INITIAL);

  const [nombre, setNombre] = React.useState("");
  const [apellido, setApellido] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  // Registro exitoso: el server action NO redirige (ver signUpAction). El
  // cliente hace la navegación con carga completa para que el navegador lleve
  // la cookie de sesión recién escrita —en Netlify el Set-Cookie se pierde en
  // el redirect 303 de un Server Action, y así caía a /login—.
  React.useEffect(() => {
    if (state.redirectTo) {
      window.location.href = state.redirectTo;
    }
  }, [state.redirectTo]);

  if (state.redirectTo) {
    return (
      <div
        role="status"
        className="border-brand-500/30 bg-brand-50 text-foreground flex items-center gap-3 rounded-lg border p-4 text-sm"
      >
        <span
          className="border-brand-500/40 border-t-brand-600 size-5 shrink-0 animate-spin rounded-full border-2"
          aria-hidden="true"
        />
        <p>Cuenta creada. Entrando a tu panel…</p>
      </div>
    );
  }

  if (state.message) {
    return (
      <div
        role="status"
        className="border-success/30 bg-success/10 text-foreground flex items-start gap-3 rounded-lg border p-4 text-sm"
      >
        <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>{state.message}</p>
      </div>
    );
  }

  const nombreOk = nombre.trim().length >= 2;
  const apellidoOk = apellido.trim().length >= 2;
  const emailOk = EMAIL_RE.test(email.trim());
  const whatsappOk = whatsapp.length === 0 || whatsappValido(whatsapp);
  const passwordOk = password.length >= 8;
  const confirmTocado = confirmPassword.length > 0;
  const confirmOk = confirmTocado && confirmPassword === password;

  const formValido =
    nombreOk &&
    apellidoOk &&
    emailOk &&
    whatsapp.trim().length > 0 &&
    whatsappValido(whatsapp) &&
    passwordOk &&
    confirmOk;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            name="nombre"
            autoComplete="given-name"
            placeholder="Tu nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.nombre)}
            required
          />
          {state.fieldErrors?.nombre ? (
            <p className="text-danger text-xs">{state.fieldErrors.nombre}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="apellido">Apellido</Label>
          <Input
            id="apellido"
            name="apellido"
            autoComplete="family-name"
            placeholder="Tu apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            aria-invalid={Boolean(state.fieldErrors?.apellido)}
            required
          />
          {state.fieldErrors?.apellido ? (
            <p className="text-danger text-xs">{state.fieldErrors.apellido}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          required
        />
        {state.fieldErrors?.email ? (
          <p className="text-danger text-xs">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">Número de WhatsApp</Label>
        <Input
          id="whatsapp"
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+58 412-1234567"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          aria-invalid={
            Boolean(state.fieldErrors?.whatsapp) || (whatsapp.length > 0 && !whatsappOk)
          }
          required
        />
        {state.fieldErrors?.whatsapp ? (
          <p className="text-danger text-xs">{state.fieldErrors.whatsapp}</p>
        ) : whatsapp.length > 0 && !whatsappOk ? (
          <p className="text-danger text-xs">Ingresa un número de teléfono válido.</p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Lo usamos para contactarte y darte soporte.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          required
        />
        <PasswordStrengthMeter password={password} />
        {state.fieldErrors?.password ? (
          <p className="text-danger text-xs">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Repite tu contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={confirmTocado && !confirmOk}
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
        {state.fieldErrors?.confirmPassword ? (
          <p className="text-danger text-xs">{state.fieldErrors.confirmPassword}</p>
        ) : null}
      </div>

      <SubmitButton className="w-full" size="lg" disabled={!formValido}>
        Crear cuenta
      </SubmitButton>
    </form>
  );
}
