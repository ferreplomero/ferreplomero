"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { Button, Card, Input, WhatsAppIcon } from "@arkiteq/ui";
import type { MmPedidoPublicoEstado } from "@arkiteq/db";
import {
  ESTADO_PEDIDO_BADGE,
  ESTADO_PEDIDO_CORTO,
  numeroPedido,
} from "@/lib/minimarket/pedidos/documento";
import type { PedidoFila } from "@/lib/minimarket/pedidos/panel";
import { bs, metodoLabel, usd } from "@/lib/minimarket/recibo-formato";
import { numeroWhatsappPedido } from "@/lib/minimarket/pedidos/whatsapp";
import { confirmarDisponibilidad, rechazarPedido, verificarPagoYRegistrar } from "./actions";

type Fila = PedidoFila & { fechaTexto: string };

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function AccionesRapidas({ p }: { p: Fila }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [rechazando, setRechazando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const puedeConfirmar = p.estado === "pago_reportado" || p.estado === "pendiente";
  const puedeRechazar =
    !p.ventaId && ["pendiente", "pago_reportado", "para_pagar_local"].includes(p.estado);
  if (!puedeConfirmar && !puedeRechazar) return null;

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const r =
        p.estado === "pago_reportado"
          ? await verificarPagoYRegistrar(p.id)
          : await confirmarDisponibilidad(p.id);
      if (r.error) {
        setError(
          r.faltantes && r.faltantes.length > 0
            ? `${r.error} Sin stock suficiente: ${r.faltantes.join(", ")}.`
            : r.error,
        );
        return;
      }
      router.refresh();
    });
  }

  function rechazar() {
    setError(null);
    startTransition(async () => {
      const r = await rechazarPedido({ pedidoId: p.id, motivo });
      if (r.error) return setError(r.error);
      setRechazando(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {!rechazando ? (
        <div className="flex flex-wrap gap-2">
          {puedeConfirmar ? (
            <Button size="sm" onClick={confirmar} disabled={pending}>
              <Check className="size-4" />
              {p.estado === "pago_reportado" ? "Verificar pago y registrar venta" : "Confirmar"}
            </Button>
          ) : null}
          {puedeRechazar ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRechazando(true)}
              disabled={pending}
            >
              <X className="size-4" />
              Rechazar
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            aria-label="Motivo del rechazo"
            className="border-border bg-background w-full rounded-md border p-2 text-sm"
            rows={2}
            maxLength={300}
            placeholder="Motivo del rechazo (lo verá el cliente)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={rechazar} disabled={pending}>
              Rechazar pedido
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRechazando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

export function PedidosLista({ pedidos }: { pedidos: Fila[] }) {
  const [q, setQ] = React.useState("");
  const [estado, setEstado] = React.useState<MmPedidoPublicoEstado | "">("");
  const [metodo, setMetodo] = React.useState("");

  const metodos = [...new Set(pedidos.map((p) => p.metodo))];
  const filtrados = pedidos.filter((p) => {
    if (estado && p.estado !== estado) return false;
    if (metodo && p.metodo !== metodo) return false;
    const t = normalizar(q.trim());
    if (!t) return true;
    const digitos = t.replace(/\D/g, "");
    return (
      normalizar(p.clienteNombre).includes(t) ||
      (digitos.length >= 3 && p.clienteTelefono.replace(/\D/g, "").includes(digitos)) ||
      normalizar(numeroPedido(p.numero)).includes(t) ||
      String(p.numero) === t ||
      p.productos.some((n) => normalizar(n).includes(t))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            aria-label="Buscar pedidos"
            placeholder="Buscar por cliente, número, teléfono o producto"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          className="border-border bg-background rounded-md border px-3 py-2 text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value as MmPedidoPublicoEstado | "")}
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_PEDIDO_CORTO) as MmPedidoPublicoEstado[]).map((e) => (
            <option key={e} value={e}>
              {ESTADO_PEDIDO_CORTO[e]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por método de pago"
          className="border-border bg-background rounded-md border px-3 py-2 text-sm"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
        >
          <option value="">Todos los métodos</option>
          {metodos.map((m) => (
            <option key={m} value={m}>
              {metodoLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          {pedidos.length === 0
            ? "Aún no has recibido pedidos. Activa tu catálogo en «Mi catálogo» y compártelo con tus clientes."
            : "Ningún pedido coincide con la búsqueda."}
        </Card>
      ) : (
        <ul className="space-y-3">
          {filtrados.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                {p.comprobanteUrl ? (
                  <a
                    href={p.comprobanteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    title="Ver comprobante"
                  >
                    <img
                      src={p.comprobanteUrl}
                      alt={`Comprobante del pedido ${numeroPedido(p.numero)}`}
                      className="border-border size-16 rounded-md border object-cover"
                    />
                  </a>
                ) : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/minimarket/pedidos/${p.id}`}
                      className="text-heading font-semibold hover:underline"
                    >
                      {numeroPedido(p.numero)}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO_BADGE[p.estado]}`}
                    >
                      {ESTADO_PEDIDO_CORTO[p.estado]}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {p.fechaTexto}
                      {p.sucursalNombre ? ` · ${p.sucursalNombre}` : ""}
                    </span>
                  </div>
                  <p className="text-sm">
                    {p.clienteNombre} ·{" "}
                    <a
                      href={`https://wa.me/${numeroWhatsappPedido(p.clienteTelefono)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-600 inline-flex items-center gap-1"
                    >
                      <WhatsAppIcon className="size-3.5" />
                      {p.clienteTelefono}
                    </a>
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {p.formaPago === "online" ? "Pago en línea" : "Pago en el local"} ·{" "}
                    {metodoLabel(p.metodo)}
                  </p>
                  <p className="text-sm tabular-nums">
                    <span className="text-heading font-semibold">{usd(p.totalUsd)}</span>{" "}
                    <span className="text-muted-foreground">({bs(p.totalBs)})</span>
                  </p>
                </div>
                <div className="sm:w-72">
                  <AccionesRapidas p={p} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
