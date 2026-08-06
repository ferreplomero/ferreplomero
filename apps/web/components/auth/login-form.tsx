"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Input, Label } from "@arkiteq/ui";
import { loginAction, type AuthState } from "@/app/(auth)/actions";
import { SubmitButton } from "./submit-button";
import { PasswordInput } from "./password-input";

const INITIAL: AuthState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, INITIAL);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {next ? <input type="hidden" name="siguiente" value={next} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="bg-danger/10 text-danger flex items-center gap-2 rounded-md px-3 py-2.5 text-sm"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          required
        />
        {state.fieldErrors?.email ? (
          <p className="text-danger text-xs">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Tu contraseña"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          required
        />
        {state.fieldErrors?.password ? (
          <p className="text-danger text-xs">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <SubmitButton className="w-full" size="lg">
        Iniciar sesión
      </SubmitButton>
    </form>
  );
}
