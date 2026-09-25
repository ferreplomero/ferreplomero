"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Search } from "lucide-react";
import { Button, Card, Input, Label, WhatsAppIcon } from "@arkiteq/ui";
import { numeroWhatsappPedido } from "@/lib/minimarket/pedidos/whatsapp";
import { ToggleSwitch } from "../../configuracion/recibo-form";
import { guardarCatalogo, guardarWhatsappCliente } from "../actions";

interface Fila {
  sucursalId: string;
  sucursalNombre: string;
  slug: string;
  activo: boolean;
  existe: boolean;
}

interface ClienteLite {
  id: string;
  nombre: string;
  cedula: string | null;
  telefono: string | null;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function normalizar(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function mensajeCatalogo(negocio: string, link: string, nombre?: string) {
  return `Hola${nombre ? ` ${nombre}` : ""}, te compartimos el catálogo de ${negocio}. Puedes ver los productos con sus precios y hacer tu pedido aquí: ${link}`;
}

function Compartir({
  link,
  negocioNombre,
  clientes,
}: {
  link: string;
  negocioNombre: string;
  clientes: ClienteLite[];
}) {
  const [modo, setModo] = React.useState<"cliente" | "numero">("cliente");
  const [q, setQ] = React.useState("");
  const [numeros, setNumeros] = React.useState<Record<string, string>>({});
  const [editando, setEditando] = React.useState<string | null>(null);
  const [nuevoNumero, setNuevoNumero] = React.useState("");
  const [numeroLibre, setNumeroLibre] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const t = normalizar(q.trim());
  const digitos = t.replace(/\D/g, "");
  const encontrados =
    t.length === 0
      ? []
      : clientes
          .filter(
            (c) =>
              normalizar(c.nombre).includes(t) ||
              (c.cedula ?? "").toLowerCase().includes(t) ||
              (digitos.length >= 3 && (c.telefono ?? "").replace(/\D/g, "").includes(digitos)),
          )
          .slice(0, 8);

  function abrirWhatsapp(numero: string, nombre?: string) {
    window.open(
      `https://wa.me/${numeroWhatsappPedido(numero)}?text=${encodeURIComponent(mensajeCatalogo(negocioNombre, link, nombre))}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  function guardarNumero(c: ClienteLite) {
    setError(null);
    startTransition(async () => {
      const r = await guardarWhatsappCliente({ clienteId: c.id, telefono: nuevoNumero });
      if (r.error) return setError(r.error);
      setNumeros((n) => ({ ...n, [c.id]: nuevoNumero }));
      setEditando(null);
      abrirWhatsapp(nuevoNumero, c.nombre);
    });
  }

  return (
    <div className="border-border space-y-3 border-t pt-3">
      <div className="flex gap-2 text-sm">
        {(
          [
            ["cliente", "Enviar a un cliente"],
            ["numero", "Enviar a otro número"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={modo === m}
            onClick={() => setModo(m)}
            className={`rounded-full border px-3 py-1 ${
              modo === m ? "border-accent-500 bg-accent-50 text-accent-700" : "border-border"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {modo === "cliente" ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              aria-label="Buscar cliente"
              placeholder="Buscar cliente por nombre, cédula o teléfono"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul className="divide-border divide-y">
            {encontrados.map((c) => {
              const numero = numeros[c.id] ?? c.telefono;
              return (
                <li key={c.id} className="space-y-2 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-heading block truncate">{c.nombre}</span>
                      <span className="text-muted-foreground text-xs">
                        {numero ?? "Sin número registrado"}
                      </span>
                    </span>
                    {numero ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrirWhatsapp(numero, c.nombre)}
                      >
                        <WhatsAppIcon className="size-4" />
                        Enviar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditando(c.id);
                          setNuevoNumero("");
                        }}
                      >
                        Registrar número
                      </Button>
                    )}
                  </div>
                  {editando === c.id ? (
                    <div className="flex gap-2">
                      <Input
                        aria-label={`WhatsApp de ${c.nombre}`}
                        type="tel"
                        placeholder="0412-1234567"
                        value={nuevoNumero}
                        onChange={(e) => setNuevoNumero(e.target.value)}
                      />
                      <Button size="sm" disabled={pending} onClick={() => guardarNumero(c)}>
                        Guardar y enviar
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {t.length > 0 && encontrados.length === 0 ? (
            <p className="text-muted-foreground text-xs">Ningún cliente coincide.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            aria-label="Número de WhatsApp"
            type="tel"
            placeholder="0412-1234567"
            value={numeroLibre}
            onChange={(e) => setNumeroLibre(e.target.value)}
          />
          <Button
            disabled={numeroLibre.replace(/\D/g, "").length < 7}
            onClick={() => abrirWhatsapp(numeroLibre)}
          >
            <WhatsAppIcon className="size-4" />
            Enviar
          </Button>
        </div>
      )}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

function FilaCatalogo({
  fila,
  baseUrl,
  negocioNombre,
  puedeEditar,
  clientes,
}: {
  fila: Fila;
  baseUrl: string;
  negocioNombre: string;
  puedeEditar: boolean;
  clientes: ClienteLite[];
}) {
  const router = useRouter();
  const [activo, setActivo] = React.useState(fila.activo);
  const [slug, setSlug] = React.useState(fila.slug);
  const [slugGuardado, setSlugGuardado] = React.useState(fila.existe ? fila.slug : "");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [copiado, setCopiado] = React.useState(false);
  const [compartir, setCompartir] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const link = `${baseUrl}/tienda/${slugGuardado || slug}`;
  const slugValido = slug.length >= 3 && slug.length <= 80 && SLUG_RE.test(slug);

  function guardar(nuevoActivo: boolean, nuevoSlug: string) {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const r = await guardarCatalogo({
        sucursalId: fila.sucursalId,
        slug: nuevoSlug,
        activo: nuevoActivo,
      });
      if (r.error) {
        setError(r.error);
        setActivo(fila.activo);
        return;
      }
      setActivo(nuevoActivo);
      setSlugGuardado(nuevoSlug);
      setOk(true);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-heading font-medium">{fila.sucursalNombre}</p>
          <p className={`text-xs ${activo ? "text-accent-600" : "text-muted-foreground"}`}>
            {activo ? "Catálogo activo" : "Catálogo desactivado"}
          </p>
        </div>
        {puedeEditar ? (
          <ToggleSwitch
            checked={activo}
            onToggle={() => {
              if (!slugValido) return setError("Corrige el enlace antes de activar el catálogo.");
              guardar(!activo, slug);
            }}
            label={`Activar o desactivar el catálogo de ${fila.sucursalNombre}`}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`slug-${fila.sucursalId}`}>Enlace</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="border-border flex flex-1 items-center overflow-hidden rounded-md border text-sm">
            <span className="text-muted-foreground bg-surface-2 hidden px-2 py-2 sm:inline">
              {baseUrl.replace(/^https?:\/\//, "")}/tienda/
            </span>
            <input
              id={`slug-${fila.sucursalId}`}
              className="bg-background min-w-0 flex-1 px-2 py-2 outline-none disabled:opacity-60"
              value={slug}
              disabled={!puedeEditar}
              maxLength={80}
              onChange={(e) =>
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-{2,}/g, "-"),
                )
              }
            />
          </div>
          {puedeEditar && slug !== slugGuardado ? (
            <Button
              size="sm"
              disabled={pending || !slugValido}
              onClick={() => guardar(activo, slug)}
            >
              Guardar enlace
            </Button>
          ) : null}
        </div>
        {!slugValido ? (
          <p className="text-danger text-xs">
            Usa entre 3 y 80 caracteres: letras minúsculas, números y guiones (sin guion al inicio
            ni al final).
          </p>
        ) : null}
      </div>

      {activo && slugGuardado ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopiado(true);
                window.setTimeout(() => setCopiado(false), 1500);
              } catch {
                /* portapapeles bloqueado */
              }
            }}
          >
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar enlace"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
              Abrir
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCompartir((v) => !v)}>
            <WhatsAppIcon className="size-4" />
            Compartir por WhatsApp
          </Button>
        </div>
      ) : null}

      {compartir && activo ? (
        <Compartir link={link} negocioNombre={negocioNombre} clientes={clientes} />
      ) : null}

      {ok && !pending ? <p className="text-xs text-green-700">Guardado.</p> : null}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
      {!puedeEditar ? (
        <p className="text-muted-foreground text-xs">
          Solo el dueño, un administrador o un supervisor pueden activar el catálogo o cambiar el
          enlace.
        </p>
      ) : null}
    </Card>
  );
}

export function MiCatalogo({
  baseUrl,
  negocioNombre,
  puedeEditar,
  filas,
  clientes,
}: {
  baseUrl: string;
  negocioNombre: string;
  puedeEditar: boolean;
  filas: Fila[];
  clientes: ClienteLite[];
}) {
  if (filas.length === 0) {
    return (
      <Card className="text-muted-foreground p-6 text-sm">No tienes sucursales asignadas.</Card>
    );
  }
  return (
    <div className="space-y-4">
      {filas.map((f) => (
        <FilaCatalogo
          key={f.sucursalId}
          fila={f}
          baseUrl={baseUrl}
          negocioNombre={negocioNombre}
          puedeEditar={puedeEditar}
          clientes={clientes}
        />
      ))}
    </div>
  );
}
