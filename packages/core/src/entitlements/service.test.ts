import { describe, expect, it } from "vitest";
import { entitlementVigente } from "./service";

describe("entitlementVigente", () => {
  const ahora = "2026-06-30T12:00:00.000Z";

  it("da acceso si está activo y sin fecha de expiración", () => {
    expect(entitlementVigente({ status: "activo", expires_at: null }, ahora)).toBe(true);
  });

  it("da acceso si está activo y la expiración es futura", () => {
    expect(
      entitlementVigente({ status: "activo", expires_at: "2026-07-01T00:00:00.000Z" }, ahora),
    ).toBe(true);
  });

  it("NO da acceso si la expiración ya pasó, aunque el status siga 'activo'", () => {
    expect(
      entitlementVigente({ status: "activo", expires_at: "2026-06-30T00:00:00.000Z" }, ahora),
    ).toBe(false);
  });

  it("NO da acceso si está suspendido, aunque no haya expirado", () => {
    expect(
      entitlementVigente({ status: "suspendido", expires_at: "2026-07-01T00:00:00.000Z" }, ahora),
    ).toBe(false);
  });

  it("NO da acceso si está cancelado", () => {
    expect(entitlementVigente({ status: "cancelado", expires_at: null }, ahora)).toBe(false);
  });
});
