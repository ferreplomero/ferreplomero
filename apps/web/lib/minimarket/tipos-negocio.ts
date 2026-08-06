/**
 * Rubros de negocio para el onboarding guiado (`/minimarket/bienvenida`).
 * Cada tipo trae un set de categorías de inventario sugeridas, con criterio
 * real del rubro venezolano — son el PUNTO DE PARTIDA: el dueño puede
 * quitarlas, renombrarlas o agregar las suyas después desde Inventario.
 * `tipo_negocio` se guarda en `mm_config_negocio` (texto + CHECK, ver
 * migración 0040) para usarse a futuro en reportes/segmentación.
 */

export type TipoNegocio =
  | "minimarket_abasto"
  | "bodega"
  | "licoreria"
  | "papeleria_libreria"
  | "charcuteria"
  | "panaderia"
  | "farmacia_perfumeria"
  | "verduleria_fruteria"
  | "ferreteria"
  | "quincalleria"
  | "carniceria"
  | "kiosco"
  | "tienda_ropa"
  | "otro";

export interface TipoNegocioOpcion {
  value: TipoNegocio;
  label: string;
  descripcion: string;
  categorias: string[];
}

export const TIPOS_NEGOCIO: TipoNegocioOpcion[] = [
  {
    value: "minimarket_abasto",
    label: "Minimarket / Abasto",
    descripcion: "Surtido general de víveres, bebidas y artículos del hogar.",
    categorias: [
      "Víveres",
      "Bebidas",
      "Refrescos y jugos",
      "Licores",
      "Charcutería",
      "Lácteos",
      "Golosinas y dulces",
      "Snacks / Pasapalos",
      "Limpieza y hogar",
      "Cuidado personal",
      "Enlatados",
      "Panadería",
      "Frío / Congelados",
      "Mascotas",
    ],
  },
  {
    value: "bodega",
    label: "Bodega",
    descripcion: "Bodega de barrio: lo esencial del día a día, rápido y cerca.",
    categorias: [
      "Víveres",
      "Bebidas",
      "Refrescos y jugos",
      "Licores",
      "Charcutería",
      "Lácteos",
      "Golosinas y dulces",
      "Snacks / Pasapalos",
      "Limpieza y hogar",
      "Cigarrillos",
      "Enlatados",
      "Panadería",
      "Cuidado personal",
      "Hielo",
    ],
  },
  {
    value: "licoreria",
    label: "Licorería",
    descripcion: "Cervezas, licores y todo para acompañar la parranda.",
    categorias: [
      "Cervezas",
      "Whisky",
      "Ron",
      "Vodka",
      "Vinos",
      "Aguardientes",
      "Licores",
      "Champagne y espumantes",
      "Hielo",
      "Snacks / Pasapalos",
      "Cigarrillos",
      "Bebidas y refrescos",
      "Energizantes",
      "Vasos y accesorios",
    ],
  },
  {
    value: "papeleria_libreria",
    label: "Papelería / Librería",
    descripcion: "Útiles escolares, oficina y todo para imprimir y regalar.",
    categorias: [
      "Cuadernos",
      "Bolígrafos y lápices",
      "Papel y cartulinas",
      "Carpetas y archivadores",
      "Material escolar",
      "Arte y manualidades",
      "Oficina",
      "Impresión y fotocopiado",
      "Regalos y detalles",
      "Uniformes escolares",
      "Adhesivos y cintas",
      "Libros",
    ],
  },
  {
    value: "charcuteria",
    label: "Charcutería",
    descripcion: "Quesos, embutidos y productos gourmet.",
    categorias: [
      "Quesos",
      "Jamones y embutidos",
      "Carnes frías",
      "Encurtidos",
      "Aceitunas",
      "Conservas gourmet",
      "Vinos",
      "Panes especiales",
      "Salsas y aderezos",
      "Snacks gourmet",
      "Lácteos",
      "Congelados",
    ],
  },
  {
    value: "panaderia",
    label: "Panadería",
    descripcion: "Pan del día, dulces, tortas y desayuno.",
    categorias: [
      "Pan salado",
      "Pan dulce",
      "Tortas y ponqués",
      "Pastelería",
      "Galletas",
      "Bebidas",
      "Café y desayuno",
      "Sándwiches",
      "Golosinas",
      "Panadería integral / diet",
      "Empanadas y pasapalos horneados",
      "Repostería para eventos",
    ],
  },
  {
    value: "farmacia_perfumeria",
    label: "Farmacia / Perfumería",
    descripcion: "Medicamentos de venta libre, cuidado personal y belleza.",
    categorias: [
      "Medicamentos OTC",
      "Cuidado personal",
      "Perfumería",
      "Bebés y maternidad",
      "Vitaminas y suplementos",
      "Primeros auxilios",
      "Higiene",
      "Cosméticos",
      "Cuidado del cabello",
      "Dermocosmética",
      "Equipos médicos",
      "Cuidado bucal",
    ],
  },
  {
    value: "verduleria_fruteria",
    label: "Verdulería / Frutería",
    descripcion: "Frutas y verduras frescas del día.",
    categorias: [
      "Frutas",
      "Verduras",
      "Hortalizas",
      "Tubérculos",
      "Hierbas y aromáticas",
      "Frutos secos",
      "Ensaladas listas",
      "Jugos naturales",
      "Legumbres",
      "Productos orgánicos",
    ],
  },
  {
    value: "ferreteria",
    label: "Ferretería",
    descripcion: "Herramientas, materiales y todo para construir y reparar.",
    categorias: [
      "Herramientas manuales",
      "Herramientas eléctricas",
      "Tornillería y fijaciones",
      "Pinturas y accesorios",
      "Plomería",
      "Electricidad",
      "Cerrajería",
      "Materiales de construcción",
      "Jardinería",
      "Seguridad industrial",
      "Adhesivos y selladores",
      "Ferretería general",
    ],
  },
  {
    value: "quincalleria",
    label: "Quincallería",
    descripcion: "Bazar y artículos varios para el hogar.",
    categorias: [
      "Bisutería",
      "Artículos del hogar",
      "Juguetes",
      "Artículos de limpieza",
      "Plásticos y envases",
      "Textiles y mercería",
      "Bazar",
      "Regalos",
      "Decoración",
      "Utensilios de cocina",
      "Artículos escolares",
      "Novedades",
    ],
  },
  {
    value: "carniceria",
    label: "Carnicería",
    descripcion: "Cortes de carne, pollo y embutidos.",
    categorias: [
      "Carne de res",
      "Carne de cerdo",
      "Pollo y aves",
      "Embutidos",
      "Vísceras",
      "Carnes procesadas / hamburguesas",
      "Mariscos",
      "Congelados",
      "Aderezos y condimentos",
      "Carbón y leña",
    ],
  },
  {
    value: "kiosco",
    label: "Kiosco",
    descripcion: "Golosinas, cigarrillos y bebidas para llevar.",
    categorias: [
      "Cigarrillos",
      "Golosinas y dulces",
      "Bebidas",
      "Snacks / Pasapalos",
      "Refrescos y jugos",
      "Helados",
      "Prensa y revistas",
      "Recargas y accesorios telefónicos",
      "Chucherías",
      "Café y bebidas calientes",
    ],
  },
  {
    value: "tienda_ropa",
    label: "Tienda de ropa",
    descripcion: "Ropa, calzado y accesorios.",
    categorias: [
      "Ropa de dama",
      "Ropa de caballero",
      "Ropa infantil",
      "Calzado",
      "Accesorios",
      "Ropa interior",
      "Bolsos y carteras",
      "Ropa deportiva",
      "Uniformes",
      "Temporada / Novedades",
    ],
  },
  {
    value: "otro",
    label: "Otro / Personalizado",
    descripcion: "Ninguna categoría se precarga — arma las tuyas desde cero.",
    categorias: [],
  },
];

export const TIPO_NEGOCIO_VALUES = TIPOS_NEGOCIO.map((t) => t.value);

export function getTipoNegocioOpcion(value: string | null): TipoNegocioOpcion | null {
  return TIPOS_NEGOCIO.find((t) => t.value === value) ?? null;
}
