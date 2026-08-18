"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema, signUpSchema } from "@arkiteq/core";
import { ACTIVE_SUCURSAL_COOKIE, ACTIVE_TENANT_COOKIE, APP_HOME, SITE } from "@/lib/site";
import { safeInternalPath } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { asegurarNegocioInicial } from "@/lib/onboarding";

const SITE_URL = SITE.url;

export interface AuthState {
  error?: string;
  message?: string;
  /**
   * Destino al que el CLIENTE debe navegar con una carga completa
   * (`window.location`) tras un registro exitoso. Ver `signUpAction` para el
   * porqué de no usar un `redirect()` de servidor aquí.
   */
  redirectTo?: string;
  fieldErrors?: Record<string, string>;
}

function firstFieldErrors(
  issues: { path: (string | number)[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}

function safeNext(value: FormDataEntryValue | null): string {
  return safeInternalPath(typeof value === "string" ? value : undefined, APP_HOME);
}

/** Inicia sesión con correo y contraseña. */
export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return {
        error: "Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.",
      };
    }
    return { error: "Correo o contraseña incorrectos." };
  }

  redirect(safeNext(formData.get("siguiente")));
}

/** Crea una cuenta nueva con nombre, apellido, WhatsApp, correo y contraseña. */
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    nombre: formData.get("nombre"),
    apellido: formData.get("apellido"),
    email: formData.get("email"),
    whatsapp: formData.get("whatsapp"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: firstFieldErrors(parsed.error.issues) };
  }

  const fullName = `${parsed.data.nombre} ${parsed.data.apellido}`.trim();

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? SITE_URL;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: fullName, whatsapp: parsed.data.whatsapp },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { error: "No pudimos crear la cuenta. ¿Quizá ya existe ese correo?" };
  }

  if (data.session && data.user) {
    await asegurarNegocioInicial(data.user);
    // NO usar `redirect()` de servidor aquí. En Netlify, el runtime de Next
    // DESCARTA el `Set-Cookie` de la sesión en la respuesta 303 de un Server
    // Action que redirige (empeora porque el registro escribe cookies extra
    // con un segundo cliente en `asegurarNegocioInicial` y la cookie de auth
    // sale fragmentada). El navegador llegaba a /inicio SIN la cookie y el
    // middleware lo rebotaba a /login. Devolvemos el destino y el cliente
    // navega con `window.location` (carga completa): el GET siguiente sí lleva
    // la cookie recién escrita —el `Set-Cookie` de una respuesta 200 de Server
    // Action sí se aplica—. Mismo patrón `hardRedirect` que ya se usa tras
    // pagar/activar demo para evitar la pantalla en negro.
    return { redirectTo: APP_HOME };
  }

  return {
    message: "Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja de entrada.",
  };
}

/** Inicia el flujo de OAuth con Google (acción de formulario). */
export async function signInWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: origin ? `${origin}/auth/callback` : `${SITE_URL}/auth/callback` },
  });

  if (error || !data.url) {
    redirect("/login?error=google");
  }

  redirect(data.url);
}

/**
 * Cierra la sesión y vuelve al inicio. Además de cerrar la sesión de
 * Supabase Auth, borra las cookies de tenant/sucursal activa — higiene
 * inmediata para dispositivos compartidos (terminal de POS con varios
 * cajeros); la protección real contra que sobrevivan a un cambio de usuario
 * vive en cómo se LEEN esas cookies (`getSessionContext`,
 * `getSucursalActiva` — ver sus comentarios), que ya ignoran cualquier
 * valor que no sea del usuario actual aunque este borrado no llegara a
 * ejecutarse (sesión expirada, ban a mitad de turno, cerrar la pestaña).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_TENANT_COOKIE);
  cookieStore.delete(ACTIVE_SUCURSAL_COOKIE);
  redirect("/");
}
