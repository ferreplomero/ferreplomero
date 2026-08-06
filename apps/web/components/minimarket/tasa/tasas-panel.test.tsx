import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TasasPanel } from "./tasas-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@powersync/react", () => ({ PowerSyncContext: { _currentValue: null } }));

vi.mock("@/lib/minimarket/use-online", () => ({ useOnline: () => true }));

vi.mock("@/app/(vertical)/minimarket/tasa/actions", () => ({
  definirTasa: vi.fn(),
  actualizarTasaAuto: vi.fn(),
  definirFuentePreferida: vi.fn(),
}));

vi.mock("@/lib/minimarket/powersync/registrar-caja-local", () => ({
  definirTasaManualLocal: vi.fn(),
  marcarFuentePreferidaLocal: vi.fn(),
}));

/**
 * Diagnóstico del reporte "solo la tarjeta Personalizada tiene input, BCV y
 * Euro BCV no": verifica que `TasasPanel` (el mismo componente en Tasa de
 * cambio Y Configuración) renderiza un input editable en LAS TRES tarjetas,
 * y que BCV/Euro conservan además su botón de actualizar por API.
 */
describe("TasasPanel", () => {
  it("muestra un input editable para las 3 tasas (Personalizada, BCV, Euro)", () => {
    render(
      <TasasPanel
        tasas={{
          bcv: { valor: 60, fecha: "2026-01-01" },
          euro: null,
          manual: null,
        }}
        fuentePreferida="bcv"
        tenantId="t1"
        usuarioId="u1"
      />,
    );

    const inputs = screen.getAllByLabelText(/Cambiar a mano \(Bs por USD\)/i);
    expect(inputs).toHaveLength(3);
    for (const input of inputs) {
      expect(input.tagName).toBe("INPUT");
      expect(input).not.toBeDisabled();
    }
  });

  it("precarga el input de BCV con su propio valor manual ya guardado", () => {
    render(
      <TasasPanel
        tasas={{
          bcv: { valor: 623.02, fecha: "2026-01-01" },
          euro: null,
          manual: null,
        }}
        fuentePreferida="bcv"
        tenantId="t1"
        usuarioId="u1"
      />,
    );

    const input = document.getElementById("valor-bcv") as HTMLInputElement;
    expect(input.value).toBe("623,02");
  });

  it("BCV y Euro tienen botón 'Sincronizar con el BCV'; Personalizada no", () => {
    render(
      <TasasPanel
        tasas={{ bcv: null, euro: null, manual: null }}
        fuentePreferida="bcv"
        tenantId="t1"
        usuarioId="u1"
      />,
    );

    expect(screen.getAllByRole("button", { name: /Sincronizar con el BCV/i })).toHaveLength(2);
  });

  it("Guardar y Hacer predeterminada son botones separados", () => {
    render(
      <TasasPanel
        tasas={{
          bcv: { valor: 60, fecha: "2026-01-01" },
          euro: null,
          manual: null,
        }}
        fuentePreferida="bcv"
        tenantId="t1"
        usuarioId="u1"
      />,
    );

    expect(screen.getAllByRole("button", { name: /^Guardar$/i })).toHaveLength(3);
    // BCV ya es la predeterminada: insignia, no botón. Euro y Personalizada sí tienen el botón.
    expect(screen.getAllByRole("button", { name: /Hacer predeterminada/i })).toHaveLength(2);
    expect(screen.getByText("Predeterminada")).toBeInTheDocument();
  });
});
