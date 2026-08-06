import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LEYENDA_NO_FISCAL_TEXTO } from "@arkiteq/ui";
import { fmtBs, fmtUsd, NOTA_PRESUPUESTO_TEXTO } from "./constants";

const ACCENT = "#2E7A6F";
const ACCENT_BG = "#EAF4F2";
const INK = "#16252B";
const MUTED = "#4A5A60";
const BORDER = "#DDE7E5";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: { width: 48, height: 48, marginBottom: 4, objectFit: "contain" },
  negocioNombre: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  meta: { color: MUTED, marginTop: 2 },
  tituloDoc: { fontSize: 11, fontFamily: "Helvetica-Bold", color: ACCENT, textAlign: "right" },
  metaDer: { color: MUTED, textAlign: "right", marginTop: 2 },
  clienteBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: ACCENT_BG,
    borderRadius: 4,
    padding: 10,
    marginBottom: 14,
  },
  clienteLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase" },
  clienteValor: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginTop: 1 },
  seccionTitulo: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginTop: 14,
    marginBottom: 6,
  },
  tablaHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 3,
  },
  tablaHeaderCell: {
    color: MUTED,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  colImagen: { width: "10%" },
  colDescripcion: { width: "31%" },
  colCantidad: { width: "14%", textAlign: "right", color: MUTED },
  colPrecio: { width: "20%", textAlign: "right", color: MUTED },
  colSubtotal: { width: "25%", textAlign: "right" },
  itemThumb: { width: 20, height: 20, borderRadius: 2, objectFit: "cover" },
  itemThumbVacio: {
    width: 20,
    height: 20,
    borderRadius: 2,
    backgroundColor: "#F4F4F4",
    borderWidth: 1,
    borderColor: BORDER,
  },
  totalBox: { marginTop: 14, padding: 12, backgroundColor: ACCENT_BG, borderRadius: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  totalLabel: { color: MUTED },
  totalValor: { fontFamily: "Helvetica-Bold", color: INK },
  totalGrande: { fontSize: 15, fontFamily: "Helvetica-Bold", color: ACCENT },
  notaLegal: {
    marginTop: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    color: MUTED,
    fontSize: 7,
    textAlign: "center",
  },
});

export interface DatosPresupuestoPdf {
  numero: string;
  fechaEmision: string;
  validezHasta: string;
  negocio: {
    nombre: string;
    rif: string | null;
    direccion: string | null;
    logoUrl: string | null;
    logoPng: Buffer | null;
  };
  cliente: { nombre: string; cedula: string | null; telefono: string | null } | null;
  items: {
    descripcion: string;
    cantidad: number;
    precioUnitarioUsd: number;
    subtotalUsd: number;
    imagenPng: Buffer | null;
  }[];
  subtotalUsd: number;
  ivaUsd: number;
  totalUsd: number;
  totalBs: number;
  tasaUsada: number;
}

export function PresupuestoDocumento({ datos }: { datos: DatosPresupuestoPdf }) {
  const cantidadFmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });

  return (
    <Document title={`Presupuesto ${datos.numero} — ${datos.negocio.nombre}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerRow}>
          <View>
            {datos.negocio.logoPng ? (
              <Image src={{ data: datos.negocio.logoPng, format: "png" }} style={styles.logo} />
            ) : null}
            <Text style={styles.negocioNombre}>{datos.negocio.nombre}</Text>
            {datos.negocio.rif ? <Text style={styles.meta}>RIF: {datos.negocio.rif}</Text> : null}
            {datos.negocio.direccion ? (
              <Text style={styles.meta}>{datos.negocio.direccion}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.tituloDoc}>PRESUPUESTO / COTIZACIÓN</Text>
            <Text style={styles.metaDer}>N.º {datos.numero}</Text>
            <Text style={styles.metaDer}>Emitido: {datos.fechaEmision}</Text>
            <Text style={styles.metaDer}>Válido hasta: {datos.validezHasta}</Text>
          </View>
        </View>

        <View style={styles.clienteBox}>
          <View>
            <Text style={styles.clienteLabel}>Cliente</Text>
            <Text style={styles.clienteValor}>{datos.cliente?.nombre ?? "Cliente ocasional"}</Text>
            {datos.cliente?.cedula ? (
              <Text style={styles.meta}>C.I./RIF: {datos.cliente.cedula}</Text>
            ) : null}
            {datos.cliente?.telefono ? (
              <Text style={styles.meta}>Tel: {datos.cliente.telefono}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.clienteLabel}>Tasa usada</Text>
            <Text style={styles.clienteValor}>Bs {datos.tasaUsada.toFixed(2)} / USD</Text>
          </View>
        </View>

        <Text style={styles.seccionTitulo}>Productos cotizados</Text>
        <View style={styles.tablaHeaderRow}>
          <Text style={[styles.tablaHeaderCell, styles.colImagen]} />
          <Text style={[styles.tablaHeaderCell, styles.colDescripcion]}>Descripción</Text>
          <Text style={[styles.tablaHeaderCell, styles.colCantidad]}>Cantidad</Text>
          <Text style={[styles.tablaHeaderCell, styles.colPrecio]}>Precio unit.</Text>
          <Text style={[styles.tablaHeaderCell, styles.colSubtotal]}>Subtotal</Text>
        </View>
        {datos.items.map((item, i) => (
          <View key={i} style={styles.fila}>
            <View style={styles.colImagen}>
              {item.imagenPng ? (
                <Image src={{ data: item.imagenPng, format: "png" }} style={styles.itemThumb} />
              ) : (
                <View style={styles.itemThumbVacio} />
              )}
            </View>
            <Text style={styles.colDescripcion}>{item.descripcion}</Text>
            <Text style={styles.colCantidad}>{cantidadFmt(item.cantidad)}</Text>
            <Text style={styles.colPrecio}>{fmtUsd(item.precioUnitarioUsd)}</Text>
            <Text style={styles.colSubtotal}>{fmtUsd(item.subtotalUsd)}</Text>
          </View>
        ))}

        <View style={styles.totalBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValor}>{fmtUsd(datos.subtotalUsd)}</Text>
          </View>
          {datos.ivaUsd > 0 ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>IVA</Text>
              <Text style={styles.totalValor}>{fmtUsd(datos.ivaUsd)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL</Text>
            <Text style={styles.totalGrande}>{fmtUsd(datos.totalUsd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Equivalente en bolívares</Text>
            <Text style={styles.totalValor}>{fmtBs(datos.totalBs)}</Text>
          </View>
        </View>

        <Text style={styles.notaLegal}>{NOTA_PRESUPUESTO_TEXTO}</Text>
        <Text style={styles.notaLegal}>{LEYENDA_NO_FISCAL_TEXTO}</Text>
      </Page>
    </Document>
  );
}
