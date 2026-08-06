import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogContent } from "@arkiteq/ui";
import { ProductoForm } from "./producto-form";
import type { OpcionImpuesto } from "@/lib/minimarket/producto-opciones";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock("@powersync/react", () => ({ PowerSyncContext: { _currentValue: null } }));

vi.mock("@/lib/minimarket/use-online", () => ({ useOnline: () => true }));

vi.mock("@/app/(vertical)/minimarket/inventario/actions", () => ({
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
}));

vi.mock("@/lib/minimarket/powersync/registrar-producto-local", () => ({
  crearProductoLocal: vi.fn(),
  actualizarProductoLocal: vi.fn(),
}));

const IMPUESTOS: OpcionImpuesto[] = [{ id: "exento", label: "Exento", rate: 0 }];

const propsBase = {
  categorias: [],
  sucursales: [],
  proveedores: [],
  impuestos: IMPUESTOS,
  impuestoIdDefault: "exento",
  aplicaIgtfDefault: false,
  etiquetasSugeridas: [],
  tasa: null,
  skuSugerido: 1,
  tenantId: "t1",
  usuarioId: "u1",
  onDone: vi.fn(),
};

/** ProductoForm usa `DialogHeader`/`DialogTitle`/`DialogFooter` de Radix — solo
 * funcionan dentro de un `<Dialog>` real, igual que en `inventario-cliente.tsx`. */
function renderForm(props: React.ComponentProps<typeof ProductoForm>) {
  return render(
    <Dialog open>
      <DialogContent>
        <ProductoForm {...props} />
      </DialogContent>
    </Dialog>,
  );
}

/**
 * Margen de ganancia global (Inventario/Configuración): un producto nuevo lo
 * sigue por defecto y su precio se autocalcula al escribir el costo; en
 * cuanto el usuario edita el margen o el precio a mano, el producto pasa a
 * margen personalizado y deja de moverse con el global hasta que el usuario
 * pida volver a seguirlo.
 */
describe("ProductoForm — margen de ganancia global", () => {
  it("producto nuevo con margen global activo: escribir el costo autocalcula precio y margen", () => {
    renderForm({ ...propsBase, producto: null, margenGlobalActivo: true, margenGlobalPct: 40 });

    expect(screen.getByText("Usando margen global (40%)")).toBeInTheDocument();

    const costo = document.getElementById("costo") as HTMLInputElement;
    fireEvent.change(costo, { target: { value: "100" } }); // mascara -> "1.00"

    const precio = document.getElementById("precio") as HTMLInputElement;
    const margen = document.getElementById("margen") as HTMLInputElement;
    expect(precio.value).toBe("1,40");
    expect(margen.value).toBe("40");
  });

  it("editar el margen a mano lo marca como personalizado y deja de seguir el global", () => {
    renderForm({ ...propsBase, producto: null, margenGlobalActivo: true, margenGlobalPct: 40 });

    const costo = document.getElementById("costo") as HTMLInputElement;
    fireEvent.change(costo, { target: { value: "100" } });

    const margen = document.getElementById("margen") as HTMLInputElement;
    fireEvent.change(margen, { target: { value: "60" } });

    const precio = document.getElementById("precio") as HTMLInputElement;
    expect(precio.value).toBe("1,60");
    expect(screen.getByText("Margen personalizado")).toBeInTheDocument();
    expect(screen.queryByText("Usando margen global (40%)")).not.toBeInTheDocument();

    // El costo ya no fuerza el 40% global — igual que el comportamiento bidireccional
    // normal (sin margen global): cambiar el costo recalcula el % mostrado a partir del
    // precio YA FIJADO (1.60), no al revés — el precio personalizado no se toca solo.
    fireEvent.change(costo, { target: { value: "200" } }); // 2.00
    expect((document.getElementById("precio") as HTMLInputElement).value).toBe("1,60");
    expect((document.getElementById("margen") as HTMLInputElement).value).toBe("-20");
  });

  it('"Volver al margen global" descarta el margen personalizado', () => {
    renderForm({ ...propsBase, producto: null, margenGlobalActivo: true, margenGlobalPct: 40 });

    const costo = document.getElementById("costo") as HTMLInputElement;
    fireEvent.change(costo, { target: { value: "100" } });
    const margen = document.getElementById("margen") as HTMLInputElement;
    fireEvent.change(margen, { target: { value: "60" } });

    fireEvent.click(screen.getByRole("button", { name: /Volver al margen global/ }));

    expect(screen.getByText("Usando margen global (40%)")).toBeInTheDocument();
    expect((document.getElementById("margen") as HTMLInputElement).value).toBe("40");
    expect((document.getElementById("precio") as HTMLInputElement).value).toBe("1,40");
  });

  it("sin margen global activo, el comportamiento es el bidireccional normal (sin insignia)", () => {
    renderForm({ ...propsBase, producto: null, margenGlobalActivo: false, margenGlobalPct: null });

    expect(screen.queryByText(/Usando margen global/)).not.toBeInTheDocument();
    expect(screen.queryByText("Margen personalizado")).not.toBeInTheDocument();

    const costo = document.getElementById("costo") as HTMLInputElement;
    fireEvent.change(costo, { target: { value: "100" } }); // 1.00

    const precio = document.getElementById("precio") as HTMLInputElement;
    fireEvent.change(precio, { target: { value: "150" } }); // 1.50
    expect((document.getElementById("margen") as HTMLInputElement).value).toBe("50");
  });
});
