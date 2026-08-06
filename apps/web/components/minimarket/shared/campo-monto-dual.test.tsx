import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampoMontoDual } from "./campo-monto-dual";

/**
 * Verifica la conversión bidireccional USD<->Bs del selector de moneda: el
 * valor que sale por `onChangeUsd` (y por lo tanto el que se guarda) SIEMPRE
 * es USD, sin importar en qué moneda esté escribiendo el usuario.
 */
describe("CampoMontoDual", () => {
  const TASA = 144.27;

  it("en modo USD (por defecto), escribir dígitos entrega el mismo valor limpio en USD", () => {
    const onChangeUsd = vi.fn();
    render(
      <CampoMontoDual
        id="costo"
        name="costo_usd"
        valorUsd=""
        onChangeUsd={onChangeUsd}
        tasa={TASA}
      />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "150" } });
    // parseMaskedInput trata los digitos como centavos: "150" -> "1.50"
    expect(onChangeUsd).toHaveBeenCalledWith("1.50");
  });

  it("al cambiar a Bs, muestra el equivalente calculado con la tasa", () => {
    render(
      <CampoMontoDual
        id="costo"
        name="costo_usd"
        valorUsd="10"
        onChangeUsd={vi.fn()}
        tasa={TASA}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bs" }));
    const input = screen.getByRole("textbox") as HTMLInputElement;
    // 10 USD * 144.27 = 1442.70
    expect(input.value).toBe("1.442,70");
  });

  it("escribir en modo Bs convierte a USD antes de emitir el cambio", () => {
    const onChangeUsd = vi.fn();
    render(
      <CampoMontoDual
        id="costo"
        name="costo_usd"
        valorUsd=""
        onChangeUsd={onChangeUsd}
        tasa={TASA}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bs" }));
    const input = screen.getByRole("textbox");
    // Escribe "72135" -> mascara -> "721.35" Bs
    fireEvent.change(input, { target: { value: "72135" } });
    // 721.35 / 144.27 = 5.0000... -> redondeado a 2 decimales
    const [usdEmitido] = onChangeUsd.mock.calls.at(-1) as [string];
    expect(Number(usdEmitido)).toBeCloseTo(721.35 / TASA, 2);
  });

  it("el input oculto que viaja al formulario siempre lleva el valor en USD", () => {
    const { container } = render(
      <CampoMontoDual
        id="precio"
        name="precio_usd"
        valorUsd="3.47"
        onChangeUsd={vi.fn()}
        tasa={TASA}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bs" }));
    const hidden = container.querySelector('input[type="hidden"][name="precio_usd"]');
    expect(hidden).toHaveValue("3.47");
  });

  it("el boton Bs esta deshabilitado sin tasa registrada", () => {
    render(
      <CampoMontoDual id="costo" name="costo_usd" valorUsd="" onChangeUsd={vi.fn()} tasa={null} />,
    );
    expect(screen.getByRole("button", { name: "Bs" })).toBeDisabled();
  });

  it("un cambio externo de valorUsd (ej. recalculo del margen) actualiza el equivalente en Bs mostrado", () => {
    const { rerender } = render(
      <CampoMontoDual
        id="precio"
        name="precio_usd"
        valorUsd="1"
        onChangeUsd={vi.fn()}
        tasa={TASA}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bs" }));
    let input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("144,27");

    // El padre (ej. producto-form al editar el % de margen) cambia valorUsd sin que
    // el usuario haya tocado este campo.
    rerender(
      <CampoMontoDual
        id="precio"
        name="precio_usd"
        valorUsd="1.8"
        onChangeUsd={vi.fn()}
        tasa={TASA}
      />,
    );
    input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("259,69");
  });
});
