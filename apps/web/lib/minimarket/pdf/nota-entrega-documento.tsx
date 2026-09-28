import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { LEYENDA_NO_FISCAL_TEXTO } from "@arkiteq/ui";
import type { NotaEntregaDatos } from "@/lib/minimarket/nota-entrega/datos";
import { metodoLabel } from "@/lib/minimarket/recibo-formato";
import { fmtBs, fmtUsd, NOTA_ENTREGA_TEXTO } from "./constants";

// Paleta propia de la nota de entrega (distinta del presupuesto) para que el
// cliente la reconozca de un vistazo como documento de despacho.
const ACCENT = "#B45309";
const ACCENT_BG = "#FEF3E2";
const INK = "#1F2A30";
const MUTED = "#55636A";
const BORDER = "#E6DED3";
const DANGER = "#B91C1C";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  franja: { height: 6, backgroundColor: ACCENT, marginBottom: 14, borderRadius: 2 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  logo: { width: 48, height: 48, marginBottom: 4, objectFit: "contain" },
  negocioNombre: { fontSize: 15, fontFamily: "Helvetica-Bold", color: INK },
  meta: { color: MUTED, marginTop: 2 },
  tituloBox: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 170,
    alignItems: "flex-end",
  },
  tituloDoc: { fontSize: 13, fontFamily: "Helvetica-Bold", color: ACCENT, textAlign: "right" },
  numeroDoc: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, textAlign: "right" },
  metaDer: { color: MUTED, textAlign: "right", marginTop: 2 },
  anulada: {
    borderWidth: 1,
    borderColor: DANGER,
    color: DANGER,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    padding: 5,
    marginBottom: 12,
    borderRadius: 3,
  },
  cajasRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  caja: { flex: 1, backgroundColor: ACCENT_BG, borderRadius: 4, padding: 10 },
  cajaLabel: { fontSize: 7, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  cajaValor: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK },
  seccionTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", color: INK, marginBottom: 6 },
  tablaHeaderRow: {
    flexDirection: "row",
    backgroundColor: INK,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  tablaHeaderCell: {
    color: "#FFFFFF",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
  },
  fila: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  colCantidad: { width: "12%", textAlign: "center" },
  colDescripcion: { width: "48%" },
  colPrecio: { width: "20%", textAlign: "right", color: MUTED },
  colTotal: { width: "20%", textAlign: "right" },
  inferiorRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  pagosBox: { flex: 1 },
  pagoRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  totalBox: { width: 220, padding: 10, backgroundColor: ACCENT_BG, borderRadius: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  totalLabel: { color: MUTED },
  totalValor: { fontFamily: "Helvetica-Bold", color: INK },
  totalGrandeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: ACCENT,
  },
  totalGrande: { fontSize: 13, fontFamily: "Helvetica-Bold", color: ACCENT },
  firmasRow: { flexDirection: "row", gap: 28, marginTop: 44 },
  firma: { flex: 1 },
  firmaLinea: { borderTopWidth: 1, borderTopColor: INK, paddingTop: 4 },
  firmaTitulo: { fontFamily: "Helvetica-Bold", textAlign: "center" },
  firmaDato: { color: MUTED, marginTop: 8 },
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

export function NotaEntregaDocumento({
  datos,
  logoPng,
}: {
  datos: NotaEntregaDatos;
  logoPng: Buffer | null;
}) {
  const { doc } = datos;
  const cantidadFmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
  const totalUnidades = doc.lineas.reduce((s, l) => s + l.cantidad, 0);
  const direccionEntrega = doc.cliente?.direccion?.trim() || null;

  return (
    <Document title={`Nota de entrega ${datos.numero} — ${doc.negocio.nombre}`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.franja} />

        <View style={styles.headerRow}>
          <View style={{ maxWidth: 280 }}>
            {doc.mostrarEncabezado && logoPng ? (
              <Image src={{ data: logoPng, format: "png" }} style={styles.logo} />
            ) : null}
            <Text style={styles.negocioNombre}>{doc.negocio.nombre}</Text>
            {doc.mostrarEncabezado && doc.negocio.rif ? (
              <Text style={styles.meta}>RIF: {doc.negocio.rif}</Text>
            ) : null}
            {doc.mostrarEncabezado && doc.negocio.direccion ? (
              <Text style={styles.meta}>{doc.negocio.direccion}</Text>
            ) : null}
          </View>
          <View style={styles.tituloBox}>
            <Text style={styles.tituloDoc}>NOTA DE ENTREGA</Text>
            <Text style={styles.numeroDoc}>N.º {datos.numero}</Text>
            <Text style={styles.metaDer}>Fecha: {datos.fecha}</Text>
            {datos.ventaNumero ? (
              <Text style={styles.metaDer}>Venta relacionada: {datos.ventaNumero}</Text>
            ) : null}
            {datos.sucursal ? (
              <Text style={styles.metaDer}>Sucursal: {datos.sucursal.nombre}</Text>
            ) : null}
          </View>
        </View>

        {doc.estado === "anulada" ? (
          <Text style={styles.anulada}>VENTA ANULADA — ESTA NOTA DE ENTREGA NO TIENE VALIDEZ</Text>
        ) : null}

        <View style={styles.cajasRow}>
          <View style={styles.caja}>
            <Text style={styles.cajaLabel}>Cliente</Text>
            <Text style={styles.cajaValor}>{doc.cliente?.nombre ?? "Cliente ocasional"}</Text>
            {doc.cliente?.cedula ? (
              <Text style={styles.meta}>C.I./RIF: {doc.cliente.cedula}</Text>
            ) : null}
            {doc.cliente?.telefono ? (
              <Text style={styles.meta}>Tel: {doc.cliente.telefono}</Text>
            ) : null}
          </View>
          <View style={styles.caja}>
            <Text style={styles.cajaLabel}>Lugar de entrega</Text>
            {direccionEntrega ? (
              <Text style={styles.cajaValor}>{direccionEntrega}</Text>
            ) : (
              <>
                <Text style={styles.cajaValor}>Retiro en tienda</Text>
                {datos.sucursal ? (
                  <Text style={styles.meta}>
                    {datos.sucursal.nombre}
                    {datos.sucursal.direccion ? ` — ${datos.sucursal.direccion}` : ""}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </View>

        <Text style={styles.seccionTitulo}>
          Mercancía entregada ({cantidadFmt(totalUnidades)}{" "}
          {totalUnidades === 1 ? "unidad" : "unidades"})
        </Text>
        <View style={styles.tablaHeaderRow}>
          <Text style={[styles.tablaHeaderCell, styles.colCantidad]}>Cant.</Text>
          <Text style={[styles.tablaHeaderCell, styles.colDescripcion]}>Descripción</Text>
          <Text style={[styles.tablaHeaderCell, styles.colPrecio, { color: "#FFFFFF" }]}>
            Precio unit.
          </Text>
          <Text style={[styles.tablaHeaderCell, styles.colTotal]}>Total</Text>
        </View>
        {doc.lineas.map((l, i) => (
          <View key={i} style={styles.fila} wrap={false}>
            <Text style={styles.colCantidad}>{cantidadFmt(l.cantidad)}</Text>
            <Text style={styles.colDescripcion}>
              {l.descripcion}
              {l.exenta ? "  (Exento de IVA)" : ""}
            </Text>
            <Text style={styles.colPrecio}>{fmtUsd(l.precioUsd)}</Text>
            <Text style={styles.colTotal}>{fmtUsd(l.totalUsd)}</Text>
          </View>
        ))}

        <View style={styles.inferiorRow} wrap={false}>
          <View style={styles.pagosBox}>
            {doc.pagos.length > 0 ? (
              <>
                <Text style={styles.seccionTitulo}>Forma de pago</Text>
                {doc.pagos.map((p, i) => (
                  <View key={i} style={styles.pagoRow}>
                    <Text style={styles.totalLabel}>{metodoLabel(p.metodo)}</Text>
                    <Text>{p.moneda === "USD" ? fmtUsd(p.monto) : fmtBs(p.monto)}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </View>
          <View style={styles.totalBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValor}>{fmtUsd(doc.subtotalUsd)}</Text>
            </View>
            {doc.ivaUsd > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IVA</Text>
                <Text style={styles.totalValor}>{fmtUsd(doc.ivaUsd)}</Text>
              </View>
            ) : null}
            {doc.igtfUsd > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IGTF (3 %)</Text>
                <Text style={styles.totalValor}>{fmtUsd(doc.igtfUsd)}</Text>
              </View>
            ) : null}
            <View style={styles.totalGrandeRow}>
              <Text style={styles.totalValor}>TOTAL</Text>
              <Text style={styles.totalGrande}>{fmtUsd(doc.totalUsd)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total en bolívares</Text>
              <Text style={styles.totalValor}>{fmtBs(doc.totalBs)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tasa del día de la venta</Text>
              <Text style={styles.totalValor}>Bs {doc.tasa.toFixed(2)} / USD</Text>
            </View>
          </View>
        </View>

        <View style={styles.firmasRow} wrap={false}>
          {["Entregado por", "Recibido conforme"].map((titulo) => (
            <View key={titulo} style={styles.firma}>
              <View style={styles.firmaLinea}>
                <Text style={styles.firmaTitulo}>{titulo}</Text>
              </View>
              <Text style={styles.firmaDato}>Nombre: ______________________________</Text>
              <Text style={styles.firmaDato}>C.I.: _________________________________</Text>
              <Text style={styles.firmaDato}>Fecha: ________________________________</Text>
            </View>
          ))}
        </View>

        <Text style={styles.notaLegal}>{NOTA_ENTREGA_TEXTO}</Text>
        {doc.mostrarLeyenda ? (
          <Text style={[styles.notaLegal, { marginTop: 4, borderTopWidth: 0, paddingTop: 0 }]}>
            {LEYENDA_NO_FISCAL_TEXTO}
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}
