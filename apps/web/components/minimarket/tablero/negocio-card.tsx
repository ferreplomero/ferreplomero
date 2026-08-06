import Link from "next/link";
import { Building2, MapPin, Settings, Sparkles } from "lucide-react";

interface ConfigNegocio {
  nombre_comercial: string;
  rif: string | null;
  direccion: string | null;
  logo_url: string | null;
  tipo_negocio: string | null;
  datos_completados_en: string | null;
}

interface NegocioCardProps {
  config: ConfigNegocio | null;
  animationDelay?: number;
}

/**
 * "Completo" = pasó por el onboarding guiado (`datos_completados_en`, el
 * mismo flag que `completarDatosNegocioInicialAction` marca al guardar).
 * Antes esto inferí a partir de `nombre_comercial.trim()`, una tabla/columna
 * distinta de la que el onboarding usa como fuente de verdad de "ya
 * completado" — quedaba desincronizado en cuanto ese campo se prellenaba o
 * guardaba por otro camino. `datos_completados_en` es el único lugar que el
 * onboarding garantiza actualizar, así que es lo único que esta tarjeta debe
 * mirar.
 */
function negocioCompleto(config: ConfigNegocio | null): config is ConfigNegocio {
  return Boolean(config?.datos_completados_en);
}

export function NegocioCard({ config, animationDelay = 100 }: NegocioCardProps) {
  // La captura de datos del negocio (nombre, RIF, teléfono, dirección, logo,
  // rubro) en `/minimarket/bienvenida` es OPCIONAL — el layout del vertical
  // NUNCA redirige a la fuerza para completarla (ver `MinimarketLayout`,
  // `necesitaDatosIniciales`). Mientras no la complete, el negocio funciona
  // igual con valores por defecto (nombre genérico, sin RIF/dirección/rubro),
  // y aquí se le ofrece esta tarjeta descartable como recordatorio, sin
  // bloquear nada. En cuanto complete el asistente, `datos_completados_en`
  // deja de ser null y esta tarjeta deja de aparecer sola.
  if (!negocioCompleto(config)) {
    return (
      <div
        className="animate-fade-up motion-reduce:animate-none"
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        <Link
          href="/minimarket/bienvenida"
          className="border-border bg-surface hover:bg-surface-2 flex items-center gap-3 rounded-xl border border-dashed p-4 transition-colors"
        >
          <span className="bg-accent-500/10 text-accent-600 inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Settings className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-heading text-sm font-semibold">Completa los datos de tu negocio</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              El nombre, RIF y dirección aparecen en cada recibo que entregas a tus clientes.
              Completarlos toma menos de un minuto.
            </p>
          </div>
          <span className="text-accent-600 ml-auto shrink-0 text-xs font-semibold">
            Completar →
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-up space-y-2 motion-reduce:animate-none"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="bg-surface border-border rounded-xl border p-5">
        <div className="flex items-start gap-4">
          {config.logo_url ? (
            <img
              src={config.logo_url}
              alt={config.nombre_comercial}
              className="size-14 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="bg-accent-500/10 text-accent-600 inline-flex size-14 shrink-0 items-center justify-center rounded-xl">
              <Building2 className="size-7" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-heading truncate text-xl font-bold">
              {config.nombre_comercial}
            </p>
            {config.rif ? (
              <p className="text-muted-foreground mt-0.5 text-xs">RIF: {config.rif}</p>
            ) : null}
            {config.direccion ? (
              <span className="text-muted-foreground mt-1.5 flex min-w-0 items-start gap-1 text-xs">
                <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{config.direccion}</span>
              </span>
            ) : null}
          </div>
          <Link
            href="/minimarket/configuracion"
            className="text-muted-foreground hover:text-heading shrink-0 text-xs transition-colors"
          >
            Editar →
          </Link>
        </div>
      </div>

      {!config.tipo_negocio ? (
        <Link
          href="/minimarket/bienvenida"
          className="border-border bg-surface hover:bg-surface-2 flex items-center gap-2.5 rounded-xl border border-dashed px-4 py-2.5 text-xs transition-colors"
        >
          <Sparkles className="text-accent-600 size-3.5 shrink-0" aria-hidden />
          <span className="text-muted-foreground">
            Elige el tipo de tu negocio y te sugerimos categorías de inventario listas para usar.
          </span>
          <span className="text-accent-600 ml-auto shrink-0 font-semibold">Elegir →</span>
        </Link>
      ) : null}
    </div>
  );
}
