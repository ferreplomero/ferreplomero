import { describe, expect, it, vi } from "vitest";
import { aprovisionarMinimarketInicial } from "./onboarding";

interface Llamada {
  tabla: string;
  operacion: "select" | "insert" | "upsert";
  payload?: unknown;
}

interface TasaPlataforma {
  valor: number;
  created_at: string;
}

/**
 * Mock mínimo del cliente Supabase, a la medida de las consultas exactas que
 * hace `aprovisionarMinimarketInicial`. `plataformaBcv`/`plataformaEuro`
 * traen un valor por defecto a propósito: si algún día un test los deja en
 * `null` sin querer, `sincronizarTasaInicial` caería al respaldo en vivo
 * (`refreshTasaAuto`, HTTP real) — con estos defaults eso nunca pasa aquí.
 */
function mockSupabase(opciones: {
  configExistente?: { id: string } | null;
  sucursalExistente?: { id: string } | null;
  sesionCajaExistente?: { id: string } | null;
  tasaBcvExistente?: { id: string } | null;
  tasaEuroExistente?: { id: string } | null;
  plataformaBcv?: TasaPlataforma | null;
  plataformaEuro?: TasaPlataforma | null;
  nuevaSucursalId?: string;
}) {
  const llamadas: Llamada[] = [];
  const {
    configExistente = null,
    sucursalExistente = null,
    sesionCajaExistente = null,
    tasaBcvExistente = null,
    tasaEuroExistente = null,
    plataformaBcv = { valor: 40, created_at: "2026-01-01T00:00:00.000Z" },
    plataformaEuro = { valor: 45, created_at: "2026-01-01T00:00:00.000Z" },
    nuevaSucursalId = "sucursal-nueva",
  } = opciones;

  function from(tabla: string) {
    const filtros: Record<string, unknown> = {};
    const encadenable: Record<string, unknown> = {
      select: vi.fn((_cols: string) => {
        llamadas.push({ tabla, operacion: "select" });
        return encadenable;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        filtros[col] = val;
        return encadenable;
      }),
      is: vi.fn(() => encadenable),
      order: vi.fn(() => encadenable),
      limit: vi.fn(() => encadenable),
      maybeSingle: vi.fn(async () => {
        if (tabla === "mm_config_negocio") return { data: configExistente, error: null };
        if (tabla === "mm_sucursales") return { data: sucursalExistente, error: null };
        if (tabla === "mm_roles") return { data: { id: "rol-dueno-id" }, error: null };
        if (tabla === "mm_caja_sesiones") return { data: sesionCajaExistente, error: null };
        if (tabla === "mm_tasas_cambio") {
          if (filtros.tipo === "bcv") return { data: tasaBcvExistente, error: null };
          if (filtros.tipo === "euro") return { data: tasaEuroExistente, error: null };
          return { data: null, error: null };
        }
        if (tabla === "platform_tasas_cambio") {
          if (filtros.tipo === "bcv") return { data: plataformaBcv, error: null };
          if (filtros.tipo === "euro") return { data: plataformaEuro, error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      insert: vi.fn((payload: unknown) => {
        llamadas.push({ tabla, operacion: "insert", payload });
        return {
          ...encadenable,
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: nuevaSucursalId }, error: null })),
          })),
          then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
        };
      }),
      upsert: vi.fn((payload: unknown, _opts: unknown) => {
        llamadas.push({ tabla, operacion: "upsert", payload });
        return Promise.resolve({ error: null });
      }),
    };
    return encadenable;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = { from: vi.fn(from) } as any;
  return { supabase, llamadas };
}

describe("aprovisionarMinimarketInicial", () => {
  it("crea config, sucursal Principal y asigna al dueño cuando el tenant no tiene nada", async () => {
    const { supabase, llamadas } = mockSupabase({});
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    const configInsert = llamadas.find(
      (l) => l.tabla === "mm_config_negocio" && l.operacion === "insert",
    );
    expect(configInsert?.payload).toMatchObject({
      tenant_id: "t1",
      fuente_tasa: "bcv",
      parametros: { igtf_activo: false, iva_activo: false },
    });

    const sucursalInsert = llamadas.find(
      (l) => l.tabla === "mm_sucursales" && l.operacion === "insert",
    );
    expect(sucursalInsert?.payload).toMatchObject({
      tenant_id: "t1",
      nombre: "Principal",
      activa: true,
    });

    const asignacion = llamadas.find(
      (l) => l.tabla === "mm_usuarios_sucursal" && l.operacion === "upsert",
    );
    expect(asignacion?.payload).toMatchObject({
      tenant_id: "t1",
      profile_id: "u1",
      sucursal_id: "sucursal-nueva",
      rol_id: "rol-dueno-id",
      activo: true,
    });

    // Las categorías ya no se precargan aquí: las crea el asistente de
    // /minimarket/bienvenida según el tipo de negocio elegido.
    expect(llamadas.some((l) => l.tabla === "mm_categorias")).toBe(false);
  });

  it("no toca la config si el tenant YA tiene una (negocio ya configurado)", async () => {
    const { supabase, llamadas } = mockSupabase({ configExistente: { id: "cfg-1" } });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");
    expect(llamadas.some((l) => l.tabla === "mm_config_negocio" && l.operacion === "insert")).toBe(
      false,
    );
  });

  it("no crea otra sucursal si el tenant ya tiene una, pero sí asigna al dueño ahí", async () => {
    const { supabase, llamadas } = mockSupabase({ sucursalExistente: { id: "suc-existente" } });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    expect(llamadas.some((l) => l.tabla === "mm_sucursales" && l.operacion === "insert")).toBe(
      false,
    );
    const asignacion = llamadas.find(
      (l) => l.tabla === "mm_usuarios_sucursal" && l.operacion === "upsert",
    );
    expect(asignacion?.payload).toMatchObject({
      sucursal_id: "suc-existente",
      rol_id: "rol-dueno-id",
    });
  });

  it("es completamente idempotente si el negocio ya estaba configurado del todo", async () => {
    const { supabase, llamadas } = mockSupabase({
      configExistente: { id: "cfg-1" },
      sucursalExistente: { id: "suc-1" },
      sesionCajaExistente: { id: "caja-1" },
      tasaBcvExistente: { id: "tasa-bcv-1" },
      tasaEuroExistente: { id: "tasa-euro-1" },
    });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    expect(llamadas.filter((l) => l.operacion === "insert")).toHaveLength(0);
    // Igual asigna/actualiza al dueño en la sucursal existente (upsert es seguro repetirlo).
    expect(llamadas.filter((l) => l.operacion === "upsert")).toHaveLength(1);
  });

  it("sincroniza bcv y euro copiando la última tasa conocida de la plataforma", async () => {
    const { supabase, llamadas } = mockSupabase({
      plataformaBcv: { valor: 45.5, created_at: "2026-01-01T00:00:00.000Z" },
      plataformaEuro: { valor: 52.3, created_at: "2026-01-01T00:00:00.000Z" },
    });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    const tasas = llamadas.filter((l) => l.tabla === "mm_tasas_cambio" && l.operacion === "insert");
    expect(tasas).toHaveLength(2);
    expect(
      tasas.find((t) => (t.payload as { tipo: string }).tipo === "bcv")?.payload,
    ).toMatchObject({ tenant_id: "t1", valor: 45.5, fuente: "auto", tipo: "bcv" });
    expect(
      tasas.find((t) => (t.payload as { tipo: string }).tipo === "euro")?.payload,
    ).toMatchObject({ tenant_id: "t1", valor: 52.3, fuente: "auto", tipo: "euro" });
  });

  it("no vuelve a sincronizar una tasa que el tenant ya tiene registrada", async () => {
    const { supabase, llamadas } = mockSupabase({ tasaBcvExistente: { id: "tasa-1" } });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    expect(
      llamadas.some(
        (l) =>
          l.tabla === "mm_tasas_cambio" &&
          l.operacion === "insert" &&
          (l.payload as { tipo: string }).tipo === "bcv",
      ),
    ).toBe(false);
    expect(
      llamadas.some(
        (l) =>
          l.tabla === "mm_tasas_cambio" &&
          l.operacion === "insert" &&
          (l.payload as { tipo: string }).tipo === "euro",
      ),
    ).toBe(true);
  });

  it("abre una caja en $0,00 / Bs 0,00 cuando el tenant no tiene ninguna sesión", async () => {
    const { supabase, llamadas } = mockSupabase({});
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");

    const caja = llamadas.find((l) => l.tabla === "mm_caja_sesiones" && l.operacion === "insert");
    expect(caja?.payload).toMatchObject({
      tenant_id: "t1",
      sucursal_id: "sucursal-nueva",
      usuario_id: "u1",
      monto_inicial_usd: 0,
      monto_inicial_bs: 0,
      estado: "abierta",
    });
  });

  it("no abre otra caja si el tenant ya tiene alguna sesión registrada", async () => {
    const { supabase, llamadas } = mockSupabase({ sesionCajaExistente: { id: "caja-1" } });
    await aprovisionarMinimarketInicial(supabase, "t1", "u1");
    expect(llamadas.some((l) => l.tabla === "mm_caja_sesiones" && l.operacion === "insert")).toBe(
      false,
    );
  });
});
