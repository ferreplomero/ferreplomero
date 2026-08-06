import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AnularVentaDialog } from "./anular-venta-dialog";
import type { VentaParaAnular } from "@/lib/minimarket/data/ventas";
import type { MmCuentaBancaria, MmMetodoPago } from "@arkiteq/db";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const { getVentaParaAnularAction, anularVentaConDevolucionAction } = vi.hoisted(() => ({
  getVentaParaAnularAction: vi.fn(),
  anularVentaConDevolucionAction: vi.fn(),
}));

vi.mock("@/app/(vertical)/minimarket/ventas/actions", () => ({
  getVentaParaAnularAction,
  anularVentaConDevolucionAction,
}));

function cuenta(overrides: Partial<MmCuentaBancaria> = {}): MmCuentaBancaria {
  return {
    id: "cuenta-1",
    tenant_id: "t1",
    metodo: "pago_movil" as MmMetodoPago,
    banco: "Banco de Venezuela",
    titular: "María Pérez",
    rif: null,
    telefono: null,
    cuenta: null,
    correo: null,
    predeterminada: false,
    activa: true,
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...overrides,
  };
}

function venta(overrides: Partial<VentaParaAnular> = {}): VentaParaAnular {
  return {
    id: "v1",
    numero: "R-000021",
    igtfUsd: 0,
    tasaUsada: 40,
    pagosReales: [
      { metodo: "pago_movil" as MmMetodoPago, montoUsd: 30, cuentaBancariaId: "cuenta-1" },
    ],
    montoRealPagadoUsd: 30,
    fiadoMontoUsd: null,
    puedeAnular: true,
    motivoBloqueo: null,
    ...overrides,
  };
}

/**
 * Regresión del bug: al elegir un método con más de una cuenta, la
 * predeterminada se veía seleccionada en el `<select>` pero el ESTADO que
 * valida el botón seguía vacío hasta que el cajero tocaba el selector a
 * mano — el botón nacía deshabilitado sin motivo real.
 */
describe("AnularVentaDialog — botón activo desde que abre, sin tocar nada", () => {
  it("pago móvil con 2 cuentas: la predeterminada queda en el estado y el botón nace habilitado", async () => {
    getVentaParaAnularAction.mockResolvedValue({
      ok: true,
      venta: venta(),
      metodosPago: [{ metodo: "pago_movil", activo: true }],
      cuentasBancarias: [
        cuenta({ id: "cuenta-1", predeterminada: false, banco: "Banesco" }),
        cuenta({ id: "cuenta-2", predeterminada: true, banco: "Mercantil" }),
      ],
      cajaAbierta: true,
      locale: "es-VE",
    });

    render(<AnularVentaDialog ventaId="v1" open onOpenChange={() => {}} />);

    const boton = await screen.findByRole("button", { name: /anular venta/i });
    await waitFor(() => expect(boton).toBeEnabled());

    // La cuenta predeterminada (Mercantil) debe ser la mostrada, sin que el
    // cajero haya tocado el selector.
    const selectCuenta = screen.getByLabelText(/cuenta de la que sale/i) as HTMLSelectElement;
    expect(selectCuenta.value).toBe("cuenta-2");
  });

  it("pago móvil con una sola cuenta: no muestra selector y el botón nace habilitado", async () => {
    getVentaParaAnularAction.mockResolvedValue({
      ok: true,
      venta: venta(),
      metodosPago: [{ metodo: "pago_movil", activo: true }],
      cuentasBancarias: [cuenta({ id: "cuenta-1", predeterminada: false })],
      cajaAbierta: true,
      locale: "es-VE",
    });

    render(<AnularVentaDialog ventaId="v1" open onOpenChange={() => {}} />);

    const boton = await screen.findByRole("button", { name: /anular venta/i });
    await waitFor(() => expect(boton).toBeEnabled());
    expect(screen.queryByLabelText(/cuenta de la que sale/i)).not.toBeInTheDocument();
  });

  it("efectivo Bs con caja abierta: el botón nace habilitado", async () => {
    getVentaParaAnularAction.mockResolvedValue({
      ok: true,
      venta: venta({
        pagosReales: [
          { metodo: "efectivo_bs" as MmMetodoPago, montoUsd: 30, cuentaBancariaId: null },
        ],
      }),
      metodosPago: [{ metodo: "efectivo_bs", activo: true }],
      cuentasBancarias: [],
      cajaAbierta: true,
      locale: "es-VE",
    });

    render(<AnularVentaDialog ventaId="v1" open onOpenChange={() => {}} />);

    const boton = await screen.findByRole("button", { name: /anular venta/i });
    await waitFor(() => expect(boton).toBeEnabled());
  });

  it("zelle con 2 correos: la predeterminada queda en el estado y el botón nace habilitado", async () => {
    getVentaParaAnularAction.mockResolvedValue({
      ok: true,
      venta: venta({
        pagosReales: [{ metodo: "zelle" as MmMetodoPago, montoUsd: 30, cuentaBancariaId: "z1" }],
      }),
      metodosPago: [{ metodo: "zelle", activo: true }],
      cuentasBancarias: [
        cuenta({
          id: "z1",
          metodo: "zelle" as MmMetodoPago,
          predeterminada: false,
          banco: "a@x.com",
        }),
        cuenta({
          id: "z2",
          metodo: "zelle" as MmMetodoPago,
          predeterminada: true,
          banco: "b@x.com",
        }),
      ],
      cajaAbierta: true,
      locale: "es-VE",
    });

    render(<AnularVentaDialog ventaId="v1" open onOpenChange={() => {}} />);

    const boton = await screen.findByRole("button", { name: /anular venta/i });
    await waitFor(() => expect(boton).toBeEnabled());
    const selectCuenta = screen.getByLabelText(/cuenta de la que sale/i) as HTMLSelectElement;
    expect(selectCuenta.value).toBe("z2");
  });
});
