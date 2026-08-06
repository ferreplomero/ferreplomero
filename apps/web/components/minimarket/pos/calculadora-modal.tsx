"use client";

import * as React from "react";
import { ArrowLeftRight, Calculator, Check, Copy, Delete } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from "@arkiteq/ui";

interface CalculadoraModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tasa del día (Bs por USD), precarga la calculadora de conversión — el usuario puede editarla. */
  tasaDelDia: number | null;
}

type Modo = "conversion" | "basica";

const TAB_CLASS = (activo: boolean) =>
  `flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
    activo ? "bg-accent-500 text-white" : "text-muted-foreground hover:bg-surface-2"
  }`;

/**
 * Calculadoras del POS — herramienta aparte del cobro, para sacar cuentas
 * rápidas sin interrumpir la venta en curso (el carrito/diálogo de cobro
 * siguen intactos detrás; se puede abrir desde el buscador de productos o
 * desde dentro del propio diálogo de cobro — mismo componente, mismo estado).
 * Dos modos: conversión USD↔Bs con tasa editable, y una calculadora normal
 * (+ − × ÷) que muestra la operación en curso. 100% cliente, sin red —
 * funciona igual con o sin conexión.
 */
export function CalculadoraModal({ open, onOpenChange, tasaDelDia }: CalculadoraModalProps) {
  const [modo, setModo] = React.useState<Modo>("conversion");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="size-5" aria-hidden />
            Calculadora
          </DialogTitle>
        </DialogHeader>

        <div className="bg-surface-2 flex gap-1 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setModo("conversion")}
            className={TAB_CLASS(modo === "conversion")}
          >
            USD / Bs
          </button>
          <button
            type="button"
            onClick={() => setModo("basica")}
            className={TAB_CLASS(modo === "basica")}
          >
            Normal
          </button>
        </div>

        {modo === "conversion" ? (
          <CalculadoraConversion tasaDelDia={tasaDelDia} />
        ) : (
          <CalculadoraBasica />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Botón de acceso — se usa tanto junto al buscador de productos como dentro del diálogo de cobro. */
export function BotonCalculadora({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      aria-label="Abrir calculadora"
      title="Calculadora"
      className={className}
    >
      <Calculator className="size-4" />
    </Button>
  );
}

/** Formatea un número con el criterio venezolano (miles con punto, decimales con coma). */
function formatearVE(n: number): string {
  if (!Number.isFinite(n)) return "";
  const esEntero = Number.isInteger(n);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: esEntero ? 0 : undefined,
    maximumFractionDigits: 8,
  }).format(n);
}

/** Botón de copiar con confirmación visual breve (✓ por 1.5s) y toast de respaldo. */
function BotonCopiar({ valor, label }: { valor: number | null; label: string }) {
  const [copiado, setCopiado] = React.useState(false);

  async function copiar() {
    if (valor === null || !Number.isFinite(valor)) return;
    const texto = formatearVE(valor);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success(`Copiado: ${texto}`);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("No se pudo copiar. Selecciona el número a mano.");
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      disabled={valor === null || !Number.isFinite(valor)}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-accent-600 hover:bg-accent-50 shrink-0 rounded-md p-2 transition-colors disabled:pointer-events-none disabled:opacity-30"
    >
      {copiado ? (
        <Check className="text-success size-4" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
    </button>
  );
}

function CalculadoraConversion({ tasaDelDia }: { tasaDelDia: number | null }) {
  const [tasa, setTasa] = React.useState(tasaDelDia ? String(tasaDelDia) : "");
  const [usd, setUsd] = React.useState("");
  const [bs, setBs] = React.useState("");

  React.useEffect(() => {
    if (tasaDelDia) setTasa((prev) => prev || String(tasaDelDia));
  }, [tasaDelDia]);

  const tasaNum = parseFloat(tasa.replace(",", "."));
  const tasaValida = Number.isFinite(tasaNum) && tasaNum > 0;
  const usdNum = parseFloat(usd.replace(",", "."));
  const bsNum = parseFloat(bs.replace(",", "."));

  function onUsd(value: string) {
    setUsd(value);
    if (!tasaValida) return;
    const n = parseFloat(value.replace(",", "."));
    setBs(Number.isFinite(n) ? (Math.round(n * tasaNum * 100) / 100).toString() : "");
  }

  function onBs(value: string) {
    setBs(value);
    if (!tasaValida) return;
    const n = parseFloat(value.replace(",", "."));
    setUsd(Number.isFinite(n) ? (Math.round((n / tasaNum) * 100) / 100).toString() : "");
  }

  function onTasa(value: string) {
    setTasa(value);
    const nuevaTasa = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(nuevaTasa) || nuevaTasa <= 0) return;
    const usdActual = parseFloat(usd.replace(",", "."));
    if (Number.isFinite(usdActual)) {
      setBs((Math.round(usdActual * nuevaTasa * 100) / 100).toString());
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="calc-tasa">Tasa (Bs por USD)</Label>
        <Input
          id="calc-tasa"
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          value={tasa}
          onChange={(e) => onTasa(e.target.value)}
          placeholder="60.00"
          className="text-center text-lg font-semibold tabular-nums"
        />
        {!tasaDelDia ? (
          <p className="text-muted-foreground text-xs">
            No hay tasa del día registrada — ingrésala a mano para convertir.
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="calc-usd">Dólares (USD)</Label>
          <div className="flex items-center gap-1">
            <Input
              id="calc-usd"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={usd}
              onChange={(e) => onUsd(e.target.value)}
              placeholder="0.00"
              className="h-12 text-right text-lg tabular-nums"
              disabled={!tasaValida}
            />
            <BotonCopiar
              valor={Number.isFinite(usdNum) ? usdNum : null}
              label="Copiar monto en dólares"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <ArrowLeftRight className="text-muted-foreground size-4 rotate-90" aria-hidden />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="calc-bs">Bolívares (Bs)</Label>
          <div className="flex items-center gap-1">
            <Input
              id="calc-bs"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={bs}
              onChange={(e) => onBs(e.target.value)}
              placeholder="0,00"
              className="h-12 text-right text-lg tabular-nums"
              disabled={!tasaValida}
            />
            <BotonCopiar
              valor={Number.isFinite(bsNum) ? bsNum : null}
              label="Copiar monto en bolívares"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculadora básica (+ − × ÷) — con la operación en curso visible
// ---------------------------------------------------------------------------

type Operador = "+" | "−" | "×" | "÷";

function aplicarOperacion(a: number, b: number, op: Operador): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

function formatearDisplay(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const redondeado = Math.round(n * 1e8) / 1e8;
  return redondeado.toString().replace(".", ",");
}

const TECLA_CLASS =
  "flex h-14 items-center justify-center rounded-xl text-xl font-medium transition-colors active:scale-95";
const TECLA_OP_CLASS = "bg-accent-500/15 text-accent-700 hover:bg-accent-500/25";
const TECLA_OP_ACTIVA_CLASS = "bg-accent-500 text-white";

function CalculadoraBasica() {
  const [display, setDisplay] = React.useState("0");
  const [acumulado, setAcumulado] = React.useState<number | null>(null);
  const [operador, setOperador] = React.useState<Operador | null>(null);
  const [esperandoNuevo, setEsperandoNuevo] = React.useState(false);
  // Línea de arriba: muestra la cuenta que se está armando (ej. "12 + 5 ×")
  // para que el usuario vea qué operación está haciendo y no se confunda.
  const [expresion, setExpresion] = React.useState("");
  const [copiado, setCopiado] = React.useState(false);

  const displayNum = parseFloat(display.replace(",", "."));

  async function copiarDisplay() {
    if (!Number.isFinite(displayNum)) return;
    const texto = formatearVE(displayNum);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success(`Copiado: ${texto}`);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("No se pudo copiar. Selecciona el número a mano.");
    }
  }

  function limpiar() {
    setDisplay("0");
    setAcumulado(null);
    setOperador(null);
    setEsperandoNuevo(false);
    setExpresion("");
  }

  function ingresarDigito(d: string) {
    // Tras un "=" o al iniciar, el primer dígito arranca una cuenta nueva:
    // limpia la línea de la operación anterior.
    if (esperandoNuevo && !operador) setExpresion("");
    if (esperandoNuevo || display === "0") {
      setDisplay(d === "," ? "0," : d);
      setEsperandoNuevo(false);
    } else if (d === "," && display.includes(",")) {
      return;
    } else if (display.replace(/[-,]/g, "").length >= 12) {
      return;
    } else {
      setDisplay(display + d);
    }
  }

  function alternarSigno() {
    setDisplay((d) => (d.startsWith("-") ? d.slice(1) : d === "0" ? d : `-${d}`));
  }

  function elegirOperador(op: Operador) {
    const actual = parseFloat(display.replace(",", "."));
    if (acumulado !== null && operador && !esperandoNuevo) {
      const resultado = aplicarOperacion(acumulado, actual, operador);
      setAcumulado(resultado);
      setDisplay(formatearDisplay(resultado));
      setExpresion(`${formatearDisplay(resultado)} ${op}`);
    } else {
      setAcumulado(actual);
      setExpresion(`${display} ${op}`);
    }
    setOperador(op);
    setEsperandoNuevo(true);
  }

  function igual() {
    if (acumulado === null || !operador) return;
    const actual = parseFloat(display.replace(",", "."));
    setExpresion(`${expresion} ${display} =`);
    const resultado = aplicarOperacion(acumulado, actual, operador);
    setDisplay(formatearDisplay(resultado));
    setAcumulado(null);
    setOperador(null);
    setEsperandoNuevo(true);
  }

  function borrarUltimo() {
    if (esperandoNuevo) return;
    setDisplay((d) =>
      d.length <= 1 || (d.length === 2 && d.startsWith("-")) ? "0" : d.slice(0, -1),
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-ink-900 space-y-1 rounded-xl px-4 py-4 text-right dark:bg-black/40">
        <p
          className="text-accent-200/80 h-4 truncate font-mono text-sm tabular-nums"
          aria-live="polite"
        >
          {expresion || " "}
        </p>
        <div className="flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums text-white">
            {display}
          </p>
          <button
            type="button"
            onClick={() => void copiarDisplay()}
            aria-label="Copiar resultado"
            title="Copiar resultado"
            className="shrink-0 rounded-md p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copiado ? <Check className="text-success size-5" /> : <Copy className="size-5" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={limpiar}
          className={`${TECLA_CLASS} bg-danger/10 text-danger hover:bg-danger/20`}
        >
          C
        </button>
        <button
          type="button"
          onClick={alternarSigno}
          className={`${TECLA_CLASS} bg-surface-2 text-heading hover:bg-border`}
        >
          ±
        </button>
        <button
          type="button"
          onClick={borrarUltimo}
          aria-label="Borrar último dígito"
          className={`${TECLA_CLASS} bg-surface-2 text-heading hover:bg-border`}
        >
          <Delete className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => elegirOperador("÷")}
          className={`${TECLA_CLASS} ${operador === "÷" && esperandoNuevo ? TECLA_OP_ACTIVA_CLASS : TECLA_OP_CLASS}`}
        >
          ÷
        </button>

        {["7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => ingresarDigito(d)}
            className={`${TECLA_CLASS} bg-surface border-border border`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => elegirOperador("×")}
          className={`${TECLA_CLASS} ${operador === "×" && esperandoNuevo ? TECLA_OP_ACTIVA_CLASS : TECLA_OP_CLASS}`}
        >
          ×
        </button>

        {["4", "5", "6"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => ingresarDigito(d)}
            className={`${TECLA_CLASS} bg-surface border-border border`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => elegirOperador("−")}
          className={`${TECLA_CLASS} ${operador === "−" && esperandoNuevo ? TECLA_OP_ACTIVA_CLASS : TECLA_OP_CLASS}`}
        >
          −
        </button>

        {["1", "2", "3"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => ingresarDigito(d)}
            className={`${TECLA_CLASS} bg-surface border-border border`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => elegirOperador("+")}
          className={`${TECLA_CLASS} ${operador === "+" && esperandoNuevo ? TECLA_OP_ACTIVA_CLASS : TECLA_OP_CLASS}`}
        >
          +
        </button>

        <button
          type="button"
          onClick={() => ingresarDigito("0")}
          className={`${TECLA_CLASS} bg-surface border-border col-span-2 border`}
        >
          0
        </button>
        <button
          type="button"
          onClick={() => ingresarDigito(",")}
          className={`${TECLA_CLASS} bg-surface border-border border`}
        >
          ,
        </button>
        <button
          type="button"
          onClick={igual}
          className={`${TECLA_CLASS} bg-accent-500 hover:bg-accent-600 text-white`}
        >
          =
        </button>
      </div>
    </div>
  );
}
