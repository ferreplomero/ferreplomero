/**
 * Fuentes automáticas de tasa Bs/[referencia] para Venezuela.
 *
 * Registra BCV (oficial, USD) y Euro BCV (oficial, EUR). Fuente PRIMARIA:
 * bcv.org.ve directo (el origen real del dato — nunca puede estar más
 * "atrasado" que sí mismo). Fuente de RESPALDO si el BCV falla (mantenimiento,
 * cambios de maquetación, etc.): ve.dolarapi.com, un agregador de terceros que
 * en la práctica puede quedar días detrás de la publicación real del BCV (así
 * se detectó este bug: dolarapi devolvía una tasa de al menos un ciclo de
 * publicación atrás mientras bcv.org.ve ya tenía la vigente).
 *
 * El servidor de bcv.org.ve tiene un error de configuración TLS conocido: no
 * envía el certificado intermedio correcto de su propia cadena (envía uno
 * viejo/no relacionado), así que cualquier cliente HTTPS estándar (Node,
 * curl sin -k) rechaza la conexión con "unable to verify the first
 * certificate" — Windows valida igual porque el sistema operativo completa la
 * cadena automáticamente (AIA chasing), algo que Node no hace. La solución
 * correcta NO es desactivar la verificación (rejectUnauthorized: false): eso
 * aceptaría cualquier certificado. En vez de eso, le damos a Node el
 * certificado intermedio + raíz REALES de Sectigo (descargados de su propio
 * repositorio público) para que complete la verificación de la cadena de
 * verdad. Si Sectigo/BCV rotan su certificado en el futuro y esto empieza a
 * fallar, cae automáticamente al respaldo de dolarapi.
 *
 * La tercera fuente ("Personalizado/Digital") es el override manual existente
 * en `mm_tasas_cambio` (fuente = 'manual'); no requiere registro aquí.
 *
 * Estas fuentes se activan desde la configuración del negocio (fuente_tasa).
 * Se importan como efecto secundario en cualquier módulo que use la tasa auto.
 */
import https from "node:https";
import { registerExchangeRateSource as reg } from "@arkiteq/core";

const DOLARAPI = "https://ve.dolarapi.com/v1";

// Cadena real de bcv.org.ve, incompleta en su propio servidor (ver nota arriba).
// Fuente: repositorio público de Sectigo (crt.sectigo.com), URLs tomadas de la
// extensión Authority Information Access del certificado hoja de bcv.org.ve.
const SECTIGO_SERVER_AUTH_CA_DV_R36 = `-----BEGIN CERTIFICATE-----
MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B
AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq
RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH
12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja
EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm
M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv
38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB
pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn
2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN
xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk
lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw
DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI
KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw
VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv
UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH
AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp
Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF
BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA
YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8
ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d
q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF
h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH
5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD
4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd
unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536
WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l
7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW
r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh
JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=
-----END CERTIFICATE-----`;

const SECTIGO_SERVER_AUTH_ROOT_R46 = `-----BEGIN CERTIFICATE-----
MIIFijCCA3KgAwIBAgIQdY39i658BwD6qSWn4cetFDANBgkqhkiG9w0BAQwFADBf
MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD
Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw
HhcNMjEwMzIyMDAwMDAwWhcNNDYwMzIxMjM1OTU5WjBfMQswCQYDVQQGEwJHQjEY
MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQDEy1TZWN0aWdvIFB1Ymxp
YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYwggIiMA0GCSqGSIb3DQEB
AQUAA4ICDwAwggIKAoICAQCTvtU2UnXYASOgHEdCSe5jtrch/cSV1UgrJnwUUxDa
ef0rty2k1Cz66jLdScK5vQ9IPXtamFSvnl0xdE8H/FAh3aTPaE8bEmNtJZlMKpnz
SDBh+oF8HqcIStw+KxwfGExxqjWMrfhu6DtK2eWUAtaJhBOqbchPM8xQljeSM9xf
iOefVNlI8JhD1mb9nxc4Q8UBUQvX4yMPFF1bFOdLvt30yNoDN9HWOaEhUTCDsG3X
ME6WW5HwcCSrv0WBZEMNvSE6Lzzpng3LILVCJ8zab5vuZDCQOc2TZYEhMbUjUDM3
IuM47fgxMMxF/mL50V0yeUKH32rMVhlATc6qu/m1dkmU8Sf4kaWD5QazYw6A3OAS
VYCmO2a0OYctyPDQ0RTp5A1NDvZdV3LFOxxHVp3i1fuBYYzMTYCQNFu31xR13NgE
SJ/AwSiItOkcyqex8Va3e0lMWeUgFaiEAin6OJRpmkkGj80feRQXEgyDet4fsZfu
+Zd4KKTIRJLpfSYFplhym3kT2BFfrsU4YjRosoYwjviQYZ4ybPUHNs2iTG7sijbt
8uaZFURww3y8nDnAtOFr94MlI1fZEoDlSfB1D++N6xybVCi0ITz8fAr/73trdf+L
HaAZBav6+CuBQug4urv7qv094PPK306Xlynt8xhW6aWWrL3DkJiy4Pmi1KZHQ3xt
zwIDAQABo0IwQDAdBgNVHQ4EFgQUVnNYZJX5khqwEioEYnmhQBWIIUkwDgYDVR0P
AQH/BAQDAgGGMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEMBQADggIBAC9c
mTz8Bl6MlC5w6tIyMY208FHVvArzZJ8HXtXBc2hkeqK5Duj5XYUtqDdFqij0lgVQ
YKlJfp/imTYpE0RHap1VIDzYm/EDMrraQKFz6oOht0SmDpkBm+S8f74TlH7Kph52
gDY9hAaLMyZlbcp+nv4fjFg4exqDsQ+8FxG75gbMY/qB8oFM2gsQa6H61SilzwZA
Fv97fRheORKkU55+MkIQpiGRqRxOF3yEvJ+M0ejf5lG5Nkc/kLnHvALcWxxPDkjB
JYOcCj+esQMzEhonrPcibCTRAUH4WAP+JWgiH5paPHxsnnVI84HxZmduTILA7rpX
DhjvLpr3Etiga+kFpaHpaPi8TD8SHkXoUsCjvxInebnMMTzD9joiFgOgyY9mpFui
TdaBJQbpdqQACj7LzTWb4OE4y2BThihCQRxEV+ioratF4yUQvNs+ZUH7G6aXD+u5
dHn5HrwdVw1Hr8Mvn4dGp+smWg9WY7ViYG4A++MnESLn/pmPNPW56MORcr3Ywx65
LvKRRFHQV80MNNVIIb/bE/FmJUNS0nAiNs2fxBx1IK1jcmMGDw4nztJqDby1ORrp
0XZ60Vzk50lJLVU3aPAaOpg+VBeHVOmmJ1CJeyAvP/+/oYtKR5j/K3tJPsMpRmAY
QqszKbrAKbkTidOIijlBO8n9pu0f9GBj39ItVQGL
-----END CERTIFICATE-----`;

function fetchBcvHomepage(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "www.bcv.org.ve",
        path: "/",
        ca: [SECTIGO_SERVER_AUTH_CA_DV_R36, SECTIGO_SERVER_AUTH_ROOT_R46],
        timeout: 10_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`bcv.org.ve respondió ${res.statusCode}.`));
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => resolve(data));
        res.on("error", reject);
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Tiempo de espera agotado consultando bcv.org.ve.")),
    );
    req.on("error", reject);
  });
}

/** Convierte "667,05000000" (formato del widget del BCV) a 667.05. Exportado para pruebas. */
export function parseNumeroBcv(raw: string): number {
  return Number(raw.trim().replace(/\./g, "").replace(",", "."));
}

/**
 * Extrae el valor de la tarjeta USD o EUR del widget de tipo de cambio de la
 * portada del BCV. Exportado para pruebas.
 */
export function parseBcvRate(html: string, moneda: "USD" | "EUR"): number {
  const bloque = new RegExp(
    `<span>\\s*${moneda}\\s*</span>[\\s\\S]{0,300}?<strong[^>]*>\\s*([\\d.,]+)\\s*</strong>`,
  );
  const match = html.match(bloque);
  const crudo = match?.[1];
  if (!crudo) {
    throw new Error(`No se encontró la tarjeta de ${moneda} en la portada del BCV.`);
  }
  const valor = parseNumeroBcv(crudo);
  if (!(valor > 0) || valor > 1_000_000) {
    throw new Error(`bcv.org.ve devolvió un valor de ${moneda} fuera de rango: "${crudo}".`);
  }
  return valor;
}

async function fetchBcvOficial(moneda: "USD" | "EUR"): Promise<number> {
  const html = await fetchBcvHomepage();
  return parseBcvRate(html, moneda);
}

async function fetchDolarApi(moneda: "dolares" | "euros", tipo: string): Promise<number> {
  const res = await fetch(`${DOLARAPI}/${moneda}/${tipo}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DolarAPI respondió ${res.status} para fuente "${moneda}/${tipo}".`);
  const data = (await res.json()) as { promedio?: number; precio?: number };
  const valor = data.promedio ?? data.precio;
  if (!valor || valor <= 0) throw new Error(`Tasa inválida desde DolarAPI (${moneda}/${tipo}).`);
  return Number(valor);
}

/** BCV directo primero (el origen real); si falla, cae a DolarAPI como respaldo. Exportado para pruebas. */
export async function fetchConRespaldo(
  primaria: () => Promise<number>,
  respaldo: () => Promise<number>,
): Promise<number> {
  try {
    return await primaria();
  } catch {
    return respaldo();
  }
}

reg({
  key: "bcv",
  label: "BCV (Banco Central de Venezuela)",
  fetchRate: () =>
    fetchConRespaldo(
      () => fetchBcvOficial("USD"),
      () => fetchDolarApi("dolares", "oficial"),
    ),
});

reg({
  key: "euro",
  label: "Euro BCV (oficial)",
  fetchRate: () =>
    fetchConRespaldo(
      () => fetchBcvOficial("EUR"),
      () => fetchDolarApi("euros", "oficial"),
    ),
});
