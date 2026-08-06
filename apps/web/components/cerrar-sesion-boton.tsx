"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@arkiteq/ui";
import { signOutAction } from "@/app/(auth)/actions";

/**
 * Botón de cierre de sesión para el pie de los menús laterales (vertical,
 * plataforma, admin) — complementa el "Cerrar sesión" que ya vive en el menú
 * de perfil (`UserMenu`, arriba a la derecha); ambos invocan el mismo
 * `signOutAction` para comportarse exactamente igual (mismo cierre de
 * sesión en Supabase Auth, mismo destino final). Este es el acceso rápido
 * para salir sin abrir ese menú — clave en la PWA instalada, donde no hay
 * barra de direcciones a la que "volver".
 *
 * Pide confirmación antes de cerrar la sesión (evita toques accidentales,
 * sobre todo en el drawer móvil, justo debajo de los enlaces de navegación).
 */
export function CerrarSesionBoton() {
  const [abierto, setAbierto] = React.useState(false);
  const [saliendo, setSaliendo] = React.useState(false);

  async function confirmar() {
    setSaliendo(true);
    await signOutAction();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAbierto(true)}
        className="text-muted-foreground hover:bg-danger/10 hover:text-danger w-full justify-start"
      >
        <LogOut className="size-4" />
        Cerrar sesión
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => !saliendo && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cerrar sesión?</DialogTitle>
            <DialogDescription>
              Vas a salir de tu cuenta. Tendrás que iniciar sesión de nuevo para volver a entrar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={saliendo}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={saliendo}>
              {saliendo ? "Cerrando…" : "Sí, cerrar sesión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
