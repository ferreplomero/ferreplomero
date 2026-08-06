import { expect, test } from "@playwright/test";

/**
 * Pruebas de rutas protegidas del módulo Minimarket.
 * Sin usuario autenticado, todas deben redirigir al login.
 * Estas pruebas validan que el middleware de auth esté activo.
 */
test.describe("Minimarket — rutas protegidas", () => {
  const RUTAS = [
    "/minimarket",
    "/minimarket/pos",
    "/minimarket/ventas",
    "/minimarket/inventario",
    "/minimarket/clientes",
    "/minimarket/compras",
    "/minimarket/caja",
    "/minimarket/reportes",
    "/minimarket/tasa",
    "/minimarket/configuracion",
    "/minimarket/sincronizacion",
  ];

  for (const ruta of RUTAS) {
    test(`redirige al login si no está autenticado: ${ruta}`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/(login|inicio)/);
    });
  }
});

/**
 * Exportación CSV: el endpoint debe rechazar sin auth (401).
 */
test.describe("Minimarket — exportaciones CSV", () => {
  test("exportar ventas sin auth retorna 401", async ({ request }) => {
    const res = await request.get("/minimarket/reportes/exportar?tipo=ventas");
    expect([401, 302, 303]).toContain(res.status());
  });

  test("exportar inventario sin auth retorna 401", async ({ request }) => {
    const res = await request.get("/minimarket/reportes/exportar?tipo=inventario");
    expect([401, 302, 303]).toContain(res.status());
  });

  test("inventario CSV sin auth no devuelve datos reales", async ({ request }) => {
    const res = await request.get("/minimarket/inventario/exportar");
    expect([401, 302, 303]).toContain(res.status());
  });
});
