"use client";

import * as React from "react";
import { AlertCircle, WifiOff } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";
import type { AbstractPowerSyncDatabase } from "@powersync/web";
import { crearCliente } from "@/app/(vertical)/minimarket/clientes/actions";
import { crearClienteLocal } from "@/lib/minimarket/powersync/registrar-cliente-local";
import { useTelefonoWhatsapp } from "@/lib/minimarket/use-telefono-whatsapp";
import { CedulaInput } from "@/components/minimarket/cedula-input";

export interface ClienteCreadoPos {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
  whatsapp: string | null;
  limite_fiado_usd: number;
  saldo_usd: number;
  saldo_favor_usd: number;
}

export interface CrearClienteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offline: boolean;
  powerSyncDb: AbstractPowerSyncDatabase | null;
  tenantId: string;
  onCreado: (cliente: ClienteCreadoPos) => void;
}

/**
 * Crear cliente EN VIVO desde la venta, sin salir del carrito en curso — el
 * cajero no tiene que cancelar la venta para registrar a alguien nuevo. Sigue
 * el mismo patrón online/offline que el resto del POS: intenta la server
 * action y, si falla o no hay conexión, escribe directo en local.
 */
export function CrearClienteModal({
  open,
  onOpenChange,
  offline,
  powerSyncDb,
  tenantId,
  onCreado,
}: CrearClienteModalProps) {
  const [nombre, setNombre] = React.useState("");
  const [cedula, setCedula] = React.useState("");
  const {
    telefono,
    whatsapp,
    setTelefono,
    setWhatsapp,
    reset: resetTelefonoWhatsapp,
  } = useTelefonoWhatsapp();
  const [limiteFiado, setLimiteFiado] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [guardando, setGuardando] = React.useState(false);

  function limpiar() {
    setNombre("");
    setCedula("");
    resetTelefonoWhatsapp();
    setLimiteFiado("");
    setError(null);
  }

  async function guardar() {
    setError(null);
    const nombreTrim = nombre.trim();
    if (nombreTrim.length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }
    const limite = limiteFiado ? Number(limiteFiado.replace(",", ".")) : 0;
    if (!Number.isFinite(limite) || limite < 0) {
      setError("El límite de fiado debe ser un número válido.");
      return;
    }

    setGuardando(true);
    try {
      if (!offline) {
        const fd = new FormData();
        fd.set("nombre", nombreTrim);
        fd.set("cedula", cedula.trim());
        fd.set("telefono", telefono.trim());
        fd.set("whatsapp", whatsapp.trim());
        fd.set("limite_fiado_usd", String(limite));
        fd.set("activo", "true");
        try {
          const res = await crearCliente({}, fd);
          if (res.error) {
            setError(res.error);
            setGuardando(false);
            return;
          }
          if (res.clienteId) {
            onCreado({
              id: res.clienteId,
              nombre: nombreTrim,
              cedula: cedula.trim() || null,
              telefono: telefono.trim() || null,
              whatsapp: whatsapp.trim() || null,
              limite_fiado_usd: limite,
              saldo_usd: 0,
              saldo_favor_usd: 0,
            });
            toast.success("Cliente creado.");
            limpiar();
            onOpenChange(false);
            setGuardando(false);
            return;
          }
        } catch {
          // Se cortó la conexión a mitad de camino: cae al mismo camino local.
        }
      }

      // Sin conexión (o se cayó a mitad de camino): escribe directo en local.
      if (!powerSyncDb) {
        setError("Sin conexión y sin base local disponible. Inténtalo de nuevo en unos segundos.");
        setGuardando(false);
        return;
      }
      const { clienteId } = await crearClienteLocal(powerSyncDb, {
        tenantId,
        nombre: nombreTrim,
        cedula: cedula.trim() || null,
        telefono: telefono.trim() || null,
        whatsapp: whatsapp.trim() || null,
        direccion: null,
        limiteFiadoUsd: limite,
        notas: null,
        activo: true,
      });
      onCreado({
        id: clienteId,
        nombre: nombreTrim,
        cedula: cedula.trim() || null,
        telefono: telefono.trim() || null,
        whatsapp: whatsapp.trim() || null,
        limite_fiado_usd: limite,
        saldo_usd: 0,
        saldo_favor_usd: 0,
      });
      toast.success("Cliente guardado en este dispositivo. Se sincronizará al conectarte.");
      limpiar();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el cliente.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!guardando) {
          onOpenChange(o);
          if (!o) limpiar();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crear cliente</DialogTitle>
          <DialogDescription>
            Se agrega a la venta en curso — no pierdes el carrito.
          </DialogDescription>
        </DialogHeader>

        {offline ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
          >
            <WifiOff className="size-4 shrink-0" aria-hidden />
            <span>
              <strong>Sin conexión</strong> — se guarda en este dispositivo y se sube solo cuando
              vuelva la señal.
            </span>
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

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pos-cliente-nombre">
              Nombre <span className="text-danger">*</span>
            </Label>
            <Input
              id="pos-cliente-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="María González"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pos-cliente-cedula">Cédula</Label>
              <CedulaInput
                id="pos-cliente-cedula"
                name="cedula"
                value={cedula}
                onChange={setCedula}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-cliente-limite">Límite fiado (USD)</Label>
              <Input
                id="pos-cliente-limite"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={limiteFiado}
                onChange={(e) => setLimiteFiado(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pos-cliente-telefono">Teléfono</Label>
              <Input
                id="pos-cliente-telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="0412-1234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos-cliente-whatsapp">WhatsApp</Label>
              <Input
                id="pos-cliente-whatsapp"
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Se copia del teléfono"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Creando…" : "Crear y seleccionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
