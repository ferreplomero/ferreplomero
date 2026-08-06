// Genera favicons/íconos PWA a partir de public/logo.png (fuente única de la
// marca Ferreplomero). Reejecutar con `pnpm generate:icons` si el logo cambia.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const SOURCE_LOGO = path.join(webRoot, "public", "logo.png");
const PUBLIC_DIR = path.join(webRoot, "public");
const APP_DIR = path.join(webRoot, "app");

// Azul teal de marca — fondo del ícono maskable (debe verse bien recortado
// en cualquier forma que le aplique el sistema operativo).
const BRAND_TEAL = "#1B9DC2";

/** Empaqueta PNGs (uno por tamaño) en un .ico multi-resolución (formato PNG-in-ICO, soportado desde Windows Vista y por todos los navegadores modernos). */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  pngBuffers.forEach(({ size, buffer }, i) => {
    const entryOffset = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0); // width
    header.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // height
    header.writeUInt8(0, entryOffset + 2); // color count
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // planes
    header.writeUInt16LE(32, entryOffset + 6); // bit count
    header.writeUInt32LE(buffer.length, entryOffset + 8); // bytes in resource
    header.writeUInt32LE(offset, entryOffset + 12); // offset
    offset += buffer.length;
  });

  return Buffer.concat([header, ...pngBuffers.map((p) => p.buffer)]);
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });

  // `ensureAlpha()` es obligatorio: el logo fuente es RGB (sin canal alfa) y un
  // PNG-en-ICO sin RGBA hace que Turbopack falle al decodificarlo en dev
  // ("The PNG is not in RGBA format!"), tumbando con 500 cualquier página que
  // referencie el favicon — es decir, todas.
  const square = (size) =>
    sharp(SOURCE_LOGO).resize(size, size, { fit: "cover" }).ensureAlpha().png().toBuffer();

  // --- Convenciones de archivo de Next.js (auto-enlazadas en <head>) ---
  await writeFile(path.join(APP_DIR, "icon.png"), await square(512));
  await writeFile(path.join(APP_DIR, "apple-icon.png"), await square(180));

  const icoSizes = [16, 32, 48];
  const icoBuffers = await Promise.all(
    icoSizes.map(async (size) => ({ size, buffer: await square(size) })),
  );
  await writeFile(path.join(APP_DIR, "favicon.ico"), buildIco(icoBuffers));

  // --- Assets estáticos adicionales en /public (referenciados por el manifest o por convención) ---
  await writeFile(path.join(PUBLIC_DIR, "favicon-16x16.png"), await square(16));
  await writeFile(path.join(PUBLIC_DIR, "favicon-32x32.png"), await square(32));
  await writeFile(path.join(PUBLIC_DIR, "apple-touch-icon.png"), await square(180));
  await writeFile(path.join(PUBLIC_DIR, "icon-192.png"), await square(192));
  await writeFile(path.join(PUBLIC_DIR, "icon-512.png"), await square(512));

  // --- Ícono maskable: el sistema puede recortarlo a círculo/squircle, así
  // que el contenido va centrado dejando ~10% de margen (zona segura) sobre
  // un fondo de marca en vez de tocar los bordes. El logo ya es un círculo
  // sobre fondo blanco: se recorta a círculo (máscara `dest-in`) antes de
  // componerlo para no dejar las esquinas blancas del cuadrado original
  // visibles sobre el fondo de marca. ---
  const maskableSize = 512;
  const safeContentSize = Math.round(maskableSize * 0.8);
  const circleMask = Buffer.from(
    `<svg width="${safeContentSize}" height="${safeContentSize}"><circle cx="${safeContentSize / 2}" cy="${safeContentSize / 2}" r="${safeContentSize / 2}" fill="#fff"/></svg>`,
  );
  const maskableLogo = await sharp(SOURCE_LOGO)
    .resize(safeContentSize, safeContentSize, { fit: "cover" })
    .ensureAlpha()
    .composite([{ input: circleMask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const maskable = await sharp({
    create: {
      width: maskableSize,
      height: maskableSize,
      channels: 4,
      background: BRAND_TEAL,
    },
  })
    .composite([
      {
        input: maskableLogo,
        left: Math.round((maskableSize - safeContentSize) / 2),
        top: Math.round((maskableSize - safeContentSize) / 2),
      },
    ])
    .png()
    .toBuffer();
  await writeFile(path.join(PUBLIC_DIR, "icon-maskable-512.png"), maskable);

  console.log("Íconos generados a partir de public/logo.png.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
