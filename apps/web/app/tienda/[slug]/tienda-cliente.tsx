"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Input, Label } from "@arkiteq/ui";
import type { MmMetodoPago } from "@arkiteq/db";
import { bs, metodoLabel, usd } from "@/lib/minimarket/recibo-formato";
import type {
  CuentaPublica,
  MetodosDisponibles,
  ProductoTienda,
} from "@/lib/minimarket/pedidos/publico";
import { cotizarPedido, crearPedidoPublico, type CotizacionResult } from "./actions";

const PAGINA = 48;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  slug: string;
  negocio: { nombre: string; logoUrl: string | null };
  sucursal: { nombre: string; direccion: string | null; telefono: string | null };
  tasa: { valor: number; tipoLabel: string } | null;
  productos: ProductoTienda[];
  categorias: { id: string; nombre: string }[];
  metodos: MetodosDisponibles;
}

type Carrito = Record<string, number>;

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function leerCarrito(slug: string): Carrito {
  try {
    const raw = window.localStorage.getItem(`tienda-carrito:${slug}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Carrito = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <button
      type="button"
      className="text-accent-600 inline-flex items-center gap-1 text-xs font-medium"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* el navegador bloqueó el portapapeles: el dato sigue visible */
        }
      }}
    >
      {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function DatoCuenta({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-right">
        <span className="text-heading break-all font-medium">{valor}</span>
        <BotonCopiar texto={valor} />
      </span>
    </div>
  );
}

function DatosCuenta({ cuenta }: { cuenta: CuentaPublica }) {
  return (
    <div className="bg-surface-2 space-y-1.5 rounded-lg p-3">
      {cuenta.metodo === "zelle" ? (
        <>
          <DatoCuenta label="Correo Zelle" valor={cuenta.correo} />
          <DatoCuenta label="Titular" valor={cuenta.titular} />
        </>
      ) : (
        <>
          <DatoCuenta label="Banco" valor={cuenta.banco} />
          {cuenta.metodo === "pago_movil" ? (
            <DatoCuenta label="Teléfono" valor={cuenta.telefono} />
          ) : (
            <DatoCuenta label="Cuenta" valor={cuenta.cuenta} />
          )}
          <DatoCuenta label="Cédula / RIF" valor={cuenta.rif} />
          <DatoCuenta label="Titular" valor={cuenta.titular} />
        </>
      )}
    </div>
  );
}

export function TiendaCliente({
  slug,
  negocio,
  sucursal,
  tasa,
  productos,
  categorias,
  metodos,
}: Props) {
  const router = useRouter();
  const [busqueda, setBusqueda] = React.useState("");
  const [categoria, setCategoria] = React.useState<string>("");
  const [limite, setLimite] = React.useState(PAGINA);
  const [carrito, setCarrito] = React.useState<Carrito>({});
  const [vista, setVista] = React.useState<"catalogo" | "carrito" | "checkout">("catalogo");

  // Checkout
  const [nombre, setNombre] = React.useState("");
  const [telefono, setTelefono] = React.useState("");
  const [forma, setForma] = React.useState<"online" | "local">(
    metodos.online.length > 0 ? "online" : "local",
  );
  const [metodo, setMetodo] = React.useState<MmMetodoPago | null>(null);
  const [cuentaId, setCuentaId] = React.useState<string | null>(null);
  const [comprobante, setComprobante] = React.useState<File | null>(null);
  const [montoEntregado, setMontoEntregado] = React.useState("");
  const [cotizacion, setCotizacion] = React.useState<CotizacionResult | null>(null);
  const [cotizando, setCotizando] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Solo se guarda DESPUÉS de haber leído el carrito guardado: si el efecto de
  // guardado corriera primero, pisaría lo guardado con el carrito vacío inicial.
  const [carritoCargado, setCarritoCargado] = React.useState(false);
  React.useEffect(() => {
    setCarrito(leerCarrito(slug));
    setCarritoCargado(true);
  }, [slug]);
  React.useEffect(() => {
    if (!carritoCargado) return;
    try {
      window.localStorage.setItem(`tienda-carrito:${slug}`, JSON.stringify(carrito));
    } catch {
      /* almacenamiento no disponible: el carrito vive solo en memoria */
    }
  }, [slug, carrito, carritoCargado]);

  const porId = React.useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const lineasCarrito = Object.entries(carrito)
    .map(([id, cantidad]) => ({ producto: porId.get(id), cantidad }))
    .filter(
      (l): l is { producto: ProductoTienda; cantidad: number } =>
        l.producto !== undefined && l.producto.disponible,
    );
  const unidades = lineasCarrito.reduce((s, l) => s + l.cantidad, 0);
  const subtotalEstimado = round2(
    lineasCarrito.reduce((s, l) => s + round2(l.producto.precioUsd * l.cantidad), 0),
  );

  const filtrados = React.useMemo(() => {
    const q = normalizar(busqueda.trim());
    return productos.filter(
      (p) =>
        (!categoria || p.categoriaId === categoria) &&
        (!q ||
          normalizar(p.nombre).includes(q) ||
          (p.descripcion ? normalizar(p.descripcion).includes(q) : false)),
    );
  }, [productos, busqueda, categoria]);
  const visibles = filtrados.slice(0, limite);

  function cambiarCantidad(id: string, delta: number) {
    setCarrito((c) => {
      const nueva = round2((c[id] ?? 0) + delta);
      const copia = { ...c };
      if (nueva <= 0) delete copia[id];
      else copia[id] = nueva;
      return copia;
    });
  }

  const itemsPayload = React.useMemo(
    () => lineasCarrito.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(carrito), porId],
  );

  // Total recalculado en el servidor al entrar al checkout o cambiar método/carrito.
  React.useEffect(() => {
    if (vista !== "checkout" || itemsPayload.length === 0) return;
    let vigente = true;
    setCotizando(true);
    cotizarPedido(slug, itemsPayload, metodo)
      .then((r) => {
        if (vigente) setCotizacion(r);
      })
      .finally(() => {
        if (vigente) setCotizando(false);
      });
    return () => {
      vigente = false;
    };
  }, [vista, slug, itemsPayload, metodo]);

  const metodoOnline = metodos.online.find((m) => m.metodo === metodo);
  const cuentaElegida =
    metodoOnline?.cuentas.find((c) => c.id === cuentaId) ?? metodoOnline?.cuentas[0] ?? null;
  const esEfectivo = metodo === "efectivo_bs" || metodo === "efectivo_usd";
  const cot = cotizacion && cotizacion.ok ? cotizacion : null;
  const totalMetodo =
    cot && metodo
      ? metodo === "efectivo_usd" || metodo === "zelle"
        ? cot.totalUsd
        : cot.totalBs
      : null;
  const montoNum = Number(montoEntregado.replace(",", "."));
  const vueltoEstimado =
    esEfectivo && totalMetodo !== null && Number.isFinite(montoNum) && montoNum > 0
      ? round2(montoNum - totalMetodo)
      : null;

  function elegirForma(f: "online" | "local") {
    setForma(f);
    setMetodo(null);
    setCuentaId(null);
    setComprobante(null);
    setMontoEntregado("");
  }

  async function confirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!metodo) return setError("Elige cómo vas a pagar.");
    if (forma === "online" && !comprobante) {
      return setError("Adjunta la imagen del comprobante de pago.");
    }
    if (vueltoEstimado !== null && vueltoEstimado < 0) {
      return setError("El monto con el que vas a pagar no cubre el total.");
    }
    const fd = new FormData(e.currentTarget);
    fd.set("slug", slug);
    fd.set("forma_pago", forma);
    fd.set("metodo", metodo);
    fd.set("cuenta_bancaria_id", forma === "online" ? (cuentaElegida?.id ?? "") : "");
    fd.set("items", JSON.stringify(itemsPayload));
    fd.set("monto_entregado", esEfectivo ? montoEntregado : "");
    if (comprobante) fd.set("comprobante", comprobante);
    setEnviando(true);
    const r = await crearPedidoPublico(fd);
    if (!r.ok) {
      setEnviando(false);
      setError(r.error);
      return;
    }
    try {
      window.localStorage.removeItem(`tienda-carrito:${slug}`);
    } catch {
      /* sin almacenamiento */
    }
    router.push(r.ruta);
  }

  const bsDe = (u: number) => (tasa ? bs(round2(u * tasa.valor)) : null);

  return (
    <div className="bg-background min-h-dvh pb-28">
      {/* Encabezado */}
      <header className="bg-surface border-border border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 p-4">
          {negocio.logoUrl ? (
            <img
              src={negocio.logoUrl}
              alt={negocio.nombre}
              className="size-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="bg-accent-50 text-accent-600 flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Store className="size-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-heading truncate text-lg font-semibold">{negocio.nombre}</h1>
            <p className="text-muted-foreground truncate text-xs">
              {sucursal.nombre}
              {sucursal.direccion ? ` · ${sucursal.direccion}` : ""}
            </p>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3">
          {tasa ? (
            <p className="bg-surface-2 text-muted-foreground inline-block rounded-full px-3 py-1 text-xs">
              Tasa {tasa.tipoLabel}:{" "}
              <span className="text-heading font-medium tabular-nums">
                Bs. {tasa.valor.toFixed(2)} / USD
              </span>
            </p>
          ) : (
            <p className="text-warning text-xs">
              El negocio aún no tiene tasa del día; los precios en Bs no están disponibles.
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {vista === "catalogo" ? (
          <>
            <div className="bg-background sticky top-0 z-10 space-y-2 py-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  type="search"
                  aria-label="Buscar productos"
                  placeholder="Buscar productos…"
                  className="pl-9"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value);
                    setLimite(PAGINA);
                  }}
                />
              </div>
              {categorias.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[{ id: "", nombre: "Todas" }, ...categorias].map((c) => (
                    <button
                      key={c.id || "todas"}
                      type="button"
                      aria-pressed={categoria === c.id}
                      onClick={() => {
                        setCategoria(c.id);
                        setLimite(PAGINA);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                        categoria === c.id
                          ? "border-accent-500 bg-accent-50 text-accent-700 font-medium"
                          : "border-border"
                      }`}
                    >
                      {c.nombre}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {visibles.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No encontramos productos.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {visibles.map((p) => {
                  const enCarrito = carrito[p.id] ?? 0;
                  return (
                    <li
                      key={p.id}
                      className="bg-surface border-border flex flex-col overflow-hidden rounded-xl border"
                    >
                      <div className="bg-surface-2 relative aspect-square">
                        {p.imagenUrl ? (
                          <img
                            src={p.imagenUrl}
                            alt={p.nombre}
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="text-muted-foreground flex size-full items-center justify-center">
                            <Package className="size-8" />
                          </div>
                        )}
                        {!p.disponible ? (
                          <span className="bg-danger absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white">
                            Agotado
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <p className="text-heading line-clamp-2 text-sm font-medium">{p.nombre}</p>
                        {p.descripcion ? (
                          <p className="text-muted-foreground line-clamp-2 text-xs">
                            {p.descripcion}
                          </p>
                        ) : null}
                        <div className="mt-auto pt-1">
                          <p className="text-heading font-semibold tabular-nums">
                            {usd(p.precioUsd)}
                          </p>
                          {bsDe(p.precioUsd) ? (
                            <p className="text-muted-foreground text-xs tabular-nums">
                              {bsDe(p.precioUsd)}
                            </p>
                          ) : null}
                        </div>
                        {!p.disponible ? (
                          <Button size="sm" variant="outline" disabled className="mt-2">
                            Agotado
                          </Button>
                        ) : enCarrito > 0 ? (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label={`Quitar una unidad de ${p.nombre}`}
                              onClick={() => cambiarCantidad(p.id, -1)}
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span className="tabular-nums">{enCarrito}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label={`Agregar una unidad de ${p.nombre}`}
                              onClick={() => cambiarCantidad(p.id, 1)}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => cambiarCantidad(p.id, 1)}
                          >
                            <Plus className="size-4" />
                            Agregar
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {filtrados.length > limite ? (
              <div className="flex justify-center pt-6">
                <Button variant="outline" onClick={() => setLimite((l) => l + PAGINA)}>
                  Ver más productos ({filtrados.length - limite} restantes)
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {vista === "carrito" ? (
          <section className="mx-auto max-w-lg space-y-4">
            <Button variant="ghost" onClick={() => setVista("catalogo")}>
              <ArrowLeft className="size-4" />
              Seguir comprando
            </Button>
            <h2 className="text-heading text-lg font-semibold">Tu carrito</h2>
            {lineasCarrito.length === 0 ? (
              <p className="text-muted-foreground text-sm">Tu carrito está vacío.</p>
            ) : (
              <>
                <ul className="divide-border bg-surface border-border divide-y rounded-xl border">
                  {lineasCarrito.map(({ producto: p, cantidad }) => (
                    <li key={p.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-heading truncate text-sm font-medium">{p.nombre}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          {usd(p.precioUsd)} c/u
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Quitar una unidad de ${p.nombre}`}
                          onClick={() => cambiarCantidad(p.id, -1)}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-8 text-center tabular-nums">{cantidad}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Agregar una unidad de ${p.nombre}`}
                          onClick={() => cambiarCantidad(p.id, 1)}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Quitar ${p.nombre} del carrito`}
                        onClick={() => cambiarCantidad(p.id, -cantidad)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal estimado</span>
                  <span className="text-right tabular-nums">
                    <span className="text-heading block font-semibold">
                      {usd(subtotalEstimado)}
                    </span>
                    {bsDe(subtotalEstimado) ? (
                      <span className="text-muted-foreground text-xs">
                        {bsDe(subtotalEstimado)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Button size="lg" className="w-full" onClick={() => setVista("checkout")}>
                  Continuar con el pedido
                </Button>
              </>
            )}
          </section>
        ) : null}

        {vista === "checkout" ? (
          <form onSubmit={confirmar} className="mx-auto max-w-lg space-y-5">
            <Button type="button" variant="ghost" onClick={() => setVista("carrito")}>
              <ArrowLeft className="size-4" />
              Volver al carrito
            </Button>

            <section className="space-y-3">
              <h2 className="text-heading text-lg font-semibold">Tus datos</h2>
              <div className="space-y-1">
                <Label htmlFor="cliente_nombre">Nombre y apellido</Label>
                <Input
                  id="cliente_nombre"
                  name="cliente_nombre"
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cliente_telefono">Teléfono (WhatsApp)</Label>
                <Input
                  id="cliente_telefono"
                  name="cliente_telefono"
                  required
                  type="tel"
                  inputMode="tel"
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="0412-1234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
              {/* Trampa para bots: oculta a personas y lectores de pantalla. */}
              <input
                type="text"
                name="web"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-heading text-lg font-semibold">¿Cómo vas a pagar?</h2>
              <div className="grid grid-cols-2 gap-2">
                {metodos.online.length > 0 ? (
                  <button
                    type="button"
                    aria-pressed={forma === "online"}
                    onClick={() => elegirForma("online")}
                    className={`rounded-lg border p-3 text-left text-sm ${
                      forma === "online" ? "border-accent-500 bg-accent-50" : "border-border"
                    }`}
                  >
                    <span className="text-heading block font-medium">Pagar ahora</span>
                    <span className="text-muted-foreground text-xs">
                      Transfiere y adjunta el comprobante
                    </span>
                  </button>
                ) : null}
                {metodos.local.length > 0 ? (
                  <button
                    type="button"
                    aria-pressed={forma === "local"}
                    onClick={() => elegirForma("local")}
                    className={`rounded-lg border p-3 text-left text-sm ${
                      forma === "local" ? "border-accent-500 bg-accent-50" : "border-border"
                    }`}
                  >
                    <span className="text-heading block font-medium">Pagar en el local</span>
                    <span className="text-muted-foreground text-xs">Pagas al retirar</span>
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {(forma === "online" ? metodos.online.map((m) => m.metodo) : metodos.local).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={metodo === m}
                      onClick={() => {
                        setMetodo(m);
                        setCuentaId(null);
                        setMontoEntregado("");
                      }}
                      className={`rounded-full border px-3 py-1.5 text-sm ${
                        metodo === m
                          ? "border-accent-500 bg-accent-50 text-accent-700 font-medium"
                          : "border-border"
                      }`}
                    >
                      {metodoLabel(m)}
                    </button>
                  ),
                )}
              </div>

              {forma === "online" && metodoOnline ? (
                <div className="space-y-3">
                  {metodoOnline.cuentas.length > 1 ? (
                    <div className="flex flex-wrap gap-2">
                      {metodoOnline.cuentas.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={cuentaElegida?.id === c.id}
                          onClick={() => setCuentaId(c.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs ${
                            cuentaElegida?.id === c.id
                              ? "border-accent-500 bg-accent-50"
                              : "border-border"
                          }`}
                        >
                          {c.banco}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {cuentaElegida ? <DatosCuenta cuenta={cuentaElegida} /> : null}
                  <div className="space-y-1">
                    <Label htmlFor="comprobante">
                      Comprobante de pago (JPG, PNG o WebP, máx. 5 MB)
                    </Label>
                    <label
                      htmlFor="comprobante"
                      className="border-border hover:bg-surface-2 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm"
                    >
                      <Upload className="size-4 shrink-0" />
                      <span className="truncate">
                        {comprobante ? comprobante.name : "Elegir imagen del comprobante"}
                      </span>
                    </label>
                    <input
                      id="comprobante"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && f.size > 5 * 1024 * 1024) {
                          setError("El comprobante no puede pesar más de 5 MB.");
                          setComprobante(null);
                          return;
                        }
                        setError(null);
                        setComprobante(f);
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {forma === "local" && esEfectivo ? (
                <div className="space-y-1">
                  <Label htmlFor="monto_entregado">
                    ¿Con cuánto vas a pagar? (opcional, {metodo === "efectivo_usd" ? "USD" : "Bs"})
                  </Label>
                  <Input
                    id="monto_entregado"
                    inputMode="decimal"
                    placeholder={metodo === "efectivo_usd" ? "ej. 20" : "ej. 3000"}
                    value={montoEntregado}
                    onChange={(e) => setMontoEntregado(e.target.value.replace(/[^\d.,]/g, ""))}
                  />
                  {vueltoEstimado !== null ? (
                    <p
                      className={`text-xs ${vueltoEstimado < 0 ? "text-danger" : "text-muted-foreground"}`}
                    >
                      {vueltoEstimado < 0
                        ? "Ese monto no cubre el total."
                        : `Vuelto estimado: ${metodo === "efectivo_usd" ? usd(vueltoEstimado) : bs(vueltoEstimado)}`}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="bg-surface border-border space-y-1 rounded-xl border p-4 text-sm">
              {cotizando ? (
                <p className="text-muted-foreground">Calculando total…</p>
              ) : cotizacion && !cotizacion.ok ? (
                <p className="text-danger">{cotizacion.error}</p>
              ) : cot ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{usd(cot.subtotalUsd)}</span>
                  </div>
                  {cot.ivaUsd > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IVA</span>
                      <span className="tabular-nums">{usd(cot.ivaUsd)}</span>
                    </div>
                  ) : null}
                  {cot.igtfUsd > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGTF (3 %)</span>
                      <span className="tabular-nums">{usd(cot.igtfUsd)}</span>
                    </div>
                  ) : null}
                  <div className="border-border flex justify-between border-t pt-1.5 text-base font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{usd(cot.totalUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total en Bs</span>
                    <span className="tabular-nums">{bs(cot.totalBs)}</span>
                  </div>
                  {!metodo ? (
                    <p className="text-muted-foreground pt-1 text-xs">
                      Elige el método de pago para ver el total final.
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>

            {error ? <p className="text-danger text-sm">{error}</p> : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={enviando || cotizando || !cot || !metodo}
            >
              {enviando ? "Enviando pedido…" : "Confirmar pedido"}
            </Button>
            <p className="text-muted-foreground text-center text-xs">
              Tu pedido queda pendiente hasta que el negocio lo confirme.
            </p>
          </form>
        ) : null}
      </main>

      {vista === "catalogo" && unidades > 0 ? (
        <div className="bg-surface border-border fixed inset-x-0 bottom-0 border-t p-3">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-heading font-semibold tabular-nums">{usd(subtotalEstimado)}</p>
              <p className="text-muted-foreground text-xs">
                {unidades} {unidades === 1 ? "producto" : "productos"}
                {bsDe(subtotalEstimado) ? ` · ${bsDe(subtotalEstimado)}` : ""}
              </p>
            </div>
            <Button size="lg" onClick={() => setVista("carrito")}>
              <ShoppingCart className="size-4" />
              Ver carrito
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
