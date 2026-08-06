import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { test as setup, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTH_FILE = path.join(__dirname, ".auth", "user.json");

/**
 * Autenticación global para los tests e2e que requieren sesión.
 * Usa E2E_USER_EMAIL y E2E_USER_PASSWORD del entorno.
 * Si las variables no están definidas, omite el setup con skip.
 */
setup("autenticar usuario de prueba", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[auth.setup] E2E_USER_EMAIL / E2E_USER_PASSWORD no definidos — tests autenticados omitidos",
    );
    setup.skip();
    return;
  }

  await page.goto("/login");

  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/(inicio|minimarket)/, { timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/login/);

  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  await page.context().storageState({ path: AUTH_FILE });
});
