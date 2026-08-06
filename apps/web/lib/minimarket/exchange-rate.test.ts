import { describe, expect, it, vi } from "vitest";
import { getRateSource, refreshTasaAuto, registerRateSource, setTasaManual } from "./exchange-rate";

describe("registro de fuentes automáticas", () => {
  it("'manual' y claves no registradas no devuelven fuente", () => {
    expect(getRateSource("manual")).toBeNull();
    expect(getRateSource(null)).toBeNull();
    expect(getRateSource("inexistente")).toBeNull();
  });

  it("una fuente registrada se recupera por su clave", () => {
    const fuente = { key: "demo", label: "Demo", fetchRate: vi.fn().mockResolvedValue(42) };
    registerRateSource(fuente);
    expect(getRateSource("demo")).toBe(fuente);
  });
});

/** Mock mínimo: solo `.from("mm_tasas_cambio").insert(payload)`, capturando el payload. */
function mockSupabaseInsert() {
  let payload: Record<string, unknown> | null = null;
  const supabase = {
    from: vi.fn(() => ({
      insert: vi.fn((p: Record<string, unknown>) => {
        payload = p;
        return Promise.resolve({ error: null });
      }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { supabase, getPayload: () => payload };
}

describe("redondeo a 2 decimales al guardar una tasa", () => {
  it("setTasaManual redondea el valor escrito a mano", async () => {
    const { supabase, getPayload } = mockSupabaseInsert();
    await setTasaManual(supabase, { tenantId: "t1", tipo: "bcv", valor: 667.056789 });
    expect(getPayload()?.valor).toBe(667.06);
  });

  it("refreshTasaAuto redondea el valor traído por la fuente automática (6+ decimales)", async () => {
    const { supabase, getPayload } = mockSupabaseInsert();
    registerRateSource({
      key: "euro-test",
      label: "Euro test",
      fetchRate: vi.fn().mockResolvedValue(763.1919165),
    });
    const valor = await refreshTasaAuto(supabase, "t1", "euro-test" as unknown as "bcv" | "euro");
    expect(valor).toBe(763.19);
    expect(getPayload()?.valor).toBe(763.19);
  });
});
