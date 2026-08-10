/**
 * Esquema local de PowerSync (SQLite en el dispositivo) para el vertical
 * Minimarket. Es el espejo de las tablas `mm_*` que se sincronizan offline.
 *
 * SQLite local solo distingue text / integer / real:
 *  - text    -> uuids (FKs), enums, fechas ISO, cadenas.
 *  - real    -> montos, cantidades, precios, tasas.
 *  - integer -> booleanos (0/1) y enteros (orden).
 * La columna `id` es implícita (text) en cada tabla.
 */
import { Schema, Table, column } from "@powersync/web";

const mm_sucursales = new Table({
  tenant_id: column.text,
  nombre: column.text,
  direccion: column.text,
  telefono: column.text,
  activa: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_usuarios_sucursal = new Table({
  tenant_id: column.text,
  profile_id: column.text,
  sucursal_id: column.text,
  rol: column.text,
  activo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_config_negocio = new Table({
  tenant_id: column.text,
  nombre_comercial: column.text,
  rif: column.text,
  direccion: column.text,
  logo_url: column.text,
  datos_fiscales: column.text,
  fuente_tasa: column.text,
  metodos_pago: column.text,
  parametros: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const mm_categorias = new Table({
  tenant_id: column.text,
  nombre: column.text,
  orden: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_productos = new Table({
  tenant_id: column.text,
  codigo: column.text,
  codigo_barras: column.text,
  nombre: column.text,
  categoria_id: column.text,
  tipo_venta: column.text,
  unidad: column.text,
  costo_usd: column.real,
  precio_usd: column.real,
  impuesto_id: column.text,
  aplica_igtf: column.integer,
  proveedor_id: column.text,
  // Lista de etiquetas serializada como JSON (PowerSync no tiene arrays nativos).
  etiquetas: column.text,
  imagen_url: column.text,
  activo: column.integer,
  usa_margen_global: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_producto_codigos = new Table({
  tenant_id: column.text,
  producto_id: column.text,
  codigo: column.text,
  created_at: column.text,
});

const mm_precios = new Table({
  tenant_id: column.text,
  producto_id: column.text,
  precio_usd: column.real,
  vigente_desde: column.text,
  usuario_id: column.text,
  created_at: column.text,
});

const mm_inventario = new Table({
  tenant_id: column.text,
  producto_id: column.text,
  sucursal_id: column.text,
  stock_minimo: column.real,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_movimientos_inventario = new Table({
  tenant_id: column.text,
  producto_id: column.text,
  sucursal_id: column.text,
  tipo: column.text,
  cantidad: column.real,
  motivo: column.text,
  referencia: column.text,
  usuario_id: column.text,
  created_at: column.text,
});

const mm_proveedores = new Table({
  tenant_id: column.text,
  nombre: column.text,
  contacto: column.text,
  telefono: column.text,
  whatsapp: column.text,
  notas: column.text,
  activo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_compras = new Table({
  tenant_id: column.text,
  proveedor_id: column.text,
  sucursal_id: column.text,
  fecha: column.text,
  total_usd: column.real,
  estado: column.text,
  notas: column.text,
  usuario_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_compras_items = new Table({
  tenant_id: column.text,
  compra_id: column.text,
  producto_id: column.text,
  cantidad: column.real,
  costo_unitario_usd: column.real,
  actualizar_costo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_clientes = new Table({
  tenant_id: column.text,
  nombre: column.text,
  cedula: column.text,
  telefono: column.text,
  whatsapp: column.text,
  direccion: column.text,
  limite_fiado_usd: column.real,
  notas: column.text,
  activo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_fiados = new Table({
  tenant_id: column.text,
  cliente_id: column.text,
  venta_id: column.text,
  monto_usd: column.real,
  estado: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_abonos_fiado = new Table({
  tenant_id: column.text,
  fiado_id: column.text,
  cliente_id: column.text,
  monto_usd: column.real,
  monto_bs: column.real,
  igtf_usd: column.real,
  tasa_usada: column.real,
  metodo: column.text,
  usuario_id: column.text,
  created_at: column.text,
});

const mm_ventas = new Table({
  tenant_id: column.text,
  sucursal_id: column.text,
  usuario_id: column.text,
  cliente_id: column.text,
  fecha: column.text,
  tasa_usada: column.real,
  subtotal_usd: column.real,
  descuento_usd: column.real,
  igtf_usd: column.real,
  total_usd: column.real,
  total_bs: column.real,
  tipo_documento: column.text,
  numero_documento: column.text,
  estado: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_ventas_items = new Table({
  tenant_id: column.text,
  venta_id: column.text,
  producto_id: column.text,
  descripcion: column.text,
  cantidad: column.real,
  precio_usd: column.real,
  impuesto_id: column.text,
  total_usd: column.real,
  precio_ajustado: column.integer,
  motivo_ajuste_precio: column.text,
  aplica_igtf: column.integer,
  created_at: column.text,
});

const mm_pagos_venta = new Table({
  tenant_id: column.text,
  venta_id: column.text,
  metodo: column.text,
  monto: column.real,
  moneda: column.text,
  tasa_usada: column.real,
  created_at: column.text,
});

// Venta en espera / borrador del POS (carrito y pagos aun sin confirmar). No
// afecta inventario ni caja mientras vive aqui -- ver 0037_minimarket_ventas_pendientes.sql.
const mm_ventas_pendientes = new Table({
  tenant_id: column.text,
  sucursal_id: column.text,
  usuario_id: column.text,
  cliente_id: column.text,
  nota: column.text,
  // [{productoId, cantidad}] / [{metodo, monto, autoSaldo}] serializado como
  // texto JSON (mismo patron que `etiquetas` de mm_productos).
  carrito_json: column.text,
  pagos_json: column.text,
  descuento_pct: column.text,
  descuento_monto: column.text,
  tasa_tipo: column.text,
  subtotal_usd: column.real,
  articulos_count: column.real,
  // 'activo' (borrador propio de este dispositivo, nunca visible en "En
  // espera") | 'en_espera' (el cajero la dejo a un lado a proposito -- ver
  // 0038_ventas_pendientes_estado.sql).
  estado: column.text,
  created_at: column.text,
  updated_at: column.text,
});

const mm_caja_sesiones = new Table({
  tenant_id: column.text,
  sucursal_id: column.text,
  usuario_id: column.text,
  monto_inicial_usd: column.real,
  monto_inicial_bs: column.real,
  monto_final_usd: column.real,
  monto_final_bs: column.real,
  diferencia_usd: column.real,
  diferencia_bs: column.real,
  estado: column.text,
  abierta_en: column.text,
  cerrada_en: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const mm_caja_movimientos = new Table({
  tenant_id: column.text,
  sesion_id: column.text,
  tipo: column.text,
  monto: column.real,
  moneda: column.text,
  motivo: column.text,
  referencia: column.text,
  usuario_id: column.text,
  created_at: column.text,
});

const mm_tasas_cambio = new Table({
  tenant_id: column.text,
  fecha: column.text,
  valor: column.real,
  fuente: column.text,
  tipo: column.text,
  usuario_id: column.text,
  created_at: column.text,
});

export const AppSchema = new Schema({
  mm_sucursales,
  mm_usuarios_sucursal,
  mm_config_negocio,
  mm_categorias,
  mm_productos,
  mm_producto_codigos,
  mm_precios,
  mm_inventario,
  mm_movimientos_inventario,
  mm_proveedores,
  mm_compras,
  mm_compras_items,
  mm_clientes,
  mm_fiados,
  mm_abonos_fiado,
  mm_ventas,
  mm_ventas_items,
  mm_pagos_venta,
  mm_ventas_pendientes,
  mm_caja_sesiones,
  mm_caja_movimientos,
  mm_tasas_cambio,
});
