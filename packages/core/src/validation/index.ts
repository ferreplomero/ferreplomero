import { z } from "zod";

/**
 * Esquemas Zod compartidos. Toda entrada externa (formularios, params, payloads)
 * se valida con Zod en los límites del sistema.
 */

export const emailSchema = z
  .string({ required_error: "El correo es obligatorio." })
  .trim()
  .min(1, "El correo es obligatorio.")
  .email("Introduce un correo válido.");

export const passwordSchema = z
  .string({ required_error: "La contraseña es obligatoria." })
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña no puede superar los 72 caracteres.");

export const fullNameSchema = z
  .string({ required_error: "El nombre es obligatorio." })
  .trim()
  .min(2, "Indica tu nombre completo.")
  .max(120, "El nombre es demasiado largo.");

export const nombreSchema = z
  .string({ required_error: "El nombre es obligatorio." })
  .trim()
  .min(2, "Indica tu nombre.")
  .max(60, "El nombre es demasiado largo.");

export const apellidoSchema = z
  .string({ required_error: "El apellido es obligatorio." })
  .trim()
  .min(2, "Indica tu apellido.")
  .max(60, "El apellido es demasiado largo.");

/** Formato razonable de teléfono/WhatsApp (Venezuela/Colombia u otro, con o sin código de país). */
export const phoneSchema = z
  .string({ required_error: "El WhatsApp es obligatorio." })
  .trim()
  .min(1, "El WhatsApp es obligatorio.")
  .regex(/^[+]?[\d\s()-]{7,20}$/, "Ingresa un número de teléfono válido.")
  .refine(
    (v) => v.replace(/\D/g, "").length >= 10,
    "El número debe tener al menos 10 dígitos (con código de área).",
  );

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones.");

export const countryCodeSchema = z.enum(["VE", "CO"], {
  errorMap: () => ({ message: "País no soportado." }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria."),
});

export const signUpSchema = z
  .object({
    nombre: nombreSchema,
    apellido: apellidoSchema,
    email: emailSchema,
    whatsapp: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string({ required_error: "Confirma tu contraseña." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Convierte un nombre libre en un slug seguro. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
