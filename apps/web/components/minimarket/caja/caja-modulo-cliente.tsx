"use client";

import * as React from "react";
import { resumirCaja, type MovimientoCaja } from "@/lib/minimarket/data/caja";
import { AbrirCajaForm } from "./abrir-caja-form";
import { CajaCliente } from "./caja-cliente";

interface SesionResumen {
  id: string;
  monto_inicial_usd: number;
  monto_inicial_bs: number;
  abierta_en: string;
}

interface Props {
  sesionInicial: SesionResumen | null;
  movimientosIniciales: MovimientoCaja[];
  tenantId: string;
  usuarioId: string;
  sucursalId: string;
  locale: string;
  tz: string;
}

/**
 * Orquesta Caja del lado del cliente para que, si el turno se abre SIN
 * conexión, el cajero pueda seguir registrando movimientos y cerrando el
 * turno sin depender de un refresh del servidor (que offline no llegaría a
 * completarse). Arranca con lo que el servidor ya resolvió; si `AbrirCajaForm`
 * confirma localmente, este componente toma el relevo del estado en memoria.
 */
export function CajaModuloCliente({
  sesionInicial,
  movimientosIniciales,
  tenantId,
  usuarioId,
  sucursalId,
  locale,
  tz,
}: Props) {
  const [sesion, setSesion] = React.useState(sesionInicial);
  const [movimientos, setMovimientos] = React.useState(movimientosIniciales);

  // El servidor sigue siendo la fuente de verdad mientras haya red: cuando
  // Next revalida la página (router.refresh tras una acción online), estos
  // props llegan actualizados y reemplazan el estado local sin más.
  React.useEffect(() => {
    setSesion(sesionInicial);
    setMovimientos(movimientosIniciales);
  }, [sesionInicial, movimientosIniciales]);

  const resumen = sesion ? resumirCaja(sesion, movimientos) : null;

  if (sesion && resumen) {
    return (
      <CajaCliente
        sesion={sesion}
        movimientos={movimientos}
        resumen={resumen}
        locale={locale}
        tz={tz}
        tenantId={tenantId}
        usuarioId={usuarioId}
        onMovimientoLocal={(m) => setMovimientos((prev) => [m, ...prev])}
        onCierreLocal={() => {
          setSesion(null);
          setMovimientos([]);
        }}
      />
    );
  }

  return (
    <AbrirCajaForm
      tenantId={tenantId}
      usuarioId={usuarioId}
      sucursalId={sucursalId}
      onAbiertaLocal={(nuevaSesion) => {
        setSesion(nuevaSesion);
        setMovimientos([]);
      }}
    />
  );
}
