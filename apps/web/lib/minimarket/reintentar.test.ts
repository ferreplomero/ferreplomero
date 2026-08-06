import { describe, expect, it, vi } from "vitest";
import { reintentar } from "./reintentar";

describe("reintentar", () => {
  it("resuelve en el primer intento si tiene éxito de inmediato (sin esperar)", async () => {
    const intentar = vi.fn().mockResolvedValue(true);
    const ok = await reintentar(intentar, { intentos: 5, esperaMs: 1000 });
    expect(ok).toBe(true);
    expect(intentar).toHaveBeenCalledTimes(1);
  });

  it("reintenta tras fallos y tiene éxito antes de agotar los intentos", async () => {
    const intentar = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const ok = await reintentar(intentar, { intentos: 5, esperaMs: 1 });
    expect(ok).toBe(true);
    expect(intentar).toHaveBeenCalledTimes(3);
  });

  it("devuelve false si nunca tiene éxito, tras agotar todos los intentos", async () => {
    const intentar = vi.fn().mockResolvedValue(false);
    const ok = await reintentar(intentar, { intentos: 4, esperaMs: 1 });
    expect(ok).toBe(false);
    expect(intentar).toHaveBeenCalledTimes(4);
  });

  it("cada reintento vuelve a llamar a la función (ve el estado más reciente)", async () => {
    // Simula el caso real: powerSyncDb pasa de null a listo entre el primer y
    // el segundo intento, como en la carrera de inicialización de PowerSync.
    let powerSyncListo = false;
    setTimeout(() => {
      powerSyncListo = true;
    }, 5);

    const ok = await reintentar(async () => powerSyncListo, { intentos: 10, esperaMs: 10 });
    expect(ok).toBe(true);
  });
});
