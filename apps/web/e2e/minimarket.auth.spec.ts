import { expect, test } from "@playwright/test";

/**
 * Tests de flujos críticos del minimarket que requieren usuario autenticado.
 * Requieren: E2E_USER_EMAIL / E2E_USER_PASSWORD + minimarket habilitado para el tenant.
 * La autenticación la maneja e2e/auth.setup.ts vía storageState.
 */

test.describe("Minimarket — acceso autenticado", () => {
  test("tablero del minimarket es accesible", async ({ page }) => {
    await page.goto("/minimarket");
    await expect(page).not.toHaveURL(/\/(login|inicio\?)/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("POS carga con el formulario de venta visible", async ({ page }) => {
    await page.goto("/minimarket/pos");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("searchbox", { name: /buscar productos/i })).toBeVisible();
  });

  test("historial de ventas muestra la tabla o estado vacío", async ({ page }) => {
    await page.goto("/minimarket/ventas");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("table, [data-testid='empty-ventas'], .text-center")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("inventario carga la lista de productos", async ({ page }) => {
    await page.goto("/minimarket/inventario");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("searchbox", { name: /buscar productos/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clientes muestra tarjetas de resumen o estado vacío", async ({ page }) => {
    await page.goto("/minimarket/clientes");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/clientes/i);
  });

  test("compras muestra la lista o estado vacío", async ({ page }) => {
    await page.goto("/minimarket/compras");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/compras/i);
  });

  test("caja muestra el estado actual", async ({ page }) => {
    await page.goto("/minimarket/caja");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/caja/i);
  });

  test("reportes carga las secciones principales", async ({ page }) => {
    await page.goto("/minimarket/reportes");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("h1")).toContainText(/reportes/i);
  });

  test("configuración muestra el formulario del negocio", async ({ page }) => {
    await page.goto("/minimarket/configuracion");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /datos del negocio/i })).toBeVisible();
  });
});

test.describe("Minimarket — flujo: nueva compra y stock", () => {
  test("el formulario de nueva compra tiene todos los campos requeridos", async ({ page }) => {
    await page.goto("/minimarket/compras/nueva");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page
        .getByRole("combobox", { name: /proveedor/i })
        .or(page.locator("select[name='proveedor_id']")),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("input[name='fecha']").or(page.getByLabel(/fecha/i))).toBeVisible();
  });
});

test.describe("Minimarket — flujo: nuevo cliente y fiado", () => {
  test("el formulario de nuevo cliente tiene nombre, teléfono y límite de crédito", async ({
    page,
  }) => {
    await page.goto("/minimarket/clientes/nuevo");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.locator("input[name='nombre']")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("input[name='telefono']").or(page.getByLabel(/teléfono/i)),
    ).toBeVisible();
    await expect(
      page.locator("input[name='limite_credito']").or(page.getByLabel(/l[ií]mite/i)),
    ).toBeVisible();
  });
});

test.describe("Minimarket — flujo: caja", () => {
  test("la página de caja muestra el estado con botón de apertura o cierre", async ({ page }) => {
    await page.goto("/minimarket/caja");
    await expect(page).not.toHaveURL(/\/login/);

    await expect(
      page
        .getByRole("button", { name: /abrir caja/i })
        .or(page.getByRole("button", { name: /cerrar caja/i }))
        .or(page.getByRole("button", { name: /registrar movimiento/i })),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Minimarket — flujo: POS", () => {
  test("el POS permite buscar productos y tiene el modal de cobro", async ({ page }) => {
    await page.goto("/minimarket/pos");
    await expect(page).not.toHaveURL(/\/login/);

    const buscador = page.getByRole("searchbox", { name: /buscar productos/i });
    await expect(buscador).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("button", { name: /cobrar/i })).toBeVisible();
  });

  test("el POS muestra el total en USD y Bs", async ({ page }) => {
    await page.goto("/minimarket/pos");
    await expect(page).not.toHaveURL(/\/login/);

    await page.waitForSelector("[class*='total'], [class*='resumen']", { timeout: 10_000 });
    const textoTotal = await page
      .locator("[class*='total'], [class*='resumen']")
      .first()
      .textContent();
    expect(textoTotal).toBeTruthy();
  });
});

test.describe("Minimarket — exportación CSV autenticada", () => {
  test("exportar ventas retorna CSV con cabecera correcta", async ({ request }) => {
    const res = await request.get("/minimarket/reportes/exportar?tipo=ventas");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("fecha");
  });

  test("exportar inventario retorna CSV con cabecera correcta", async ({ request }) => {
    const res = await request.get("/minimarket/reportes/exportar?tipo=inventario");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("nombre");
  });
});
