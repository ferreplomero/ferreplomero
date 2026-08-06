import {
  Building2,
  Package,
  Store,
  Stethoscope,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  store: Store,
  wrench: Wrench,
  stethoscope: Stethoscope,
  warehouse: Warehouse,
  building: Building2,
  package: Package,
};

export interface ProductIconProps {
  name: string;
  className?: string;
}

/** Renderiza el icono de un producto a partir de su nombre (con respaldo). */
export function ProductIcon({ name, className }: ProductIconProps) {
  const Icon = ICONS[name] ?? Package;
  return <Icon className={className} aria-hidden="true" />;
}
