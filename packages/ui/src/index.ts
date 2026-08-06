// Utilidades
export { cn } from "./lib/cn";

// Primitivos
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/card";
export { Input, type InputProps } from "./components/input";
export { Label } from "./components/label";
export { Badge, badgeVariants, type BadgeProps } from "./components/badge";
export { Separator } from "./components/separator";
export { Skeleton } from "./components/skeleton";
export { Avatar, AvatarImage, AvatarFallback } from "./components/avatar";

// Overlays e interacción
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSubTrigger,
} from "./components/dropdown-menu";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./components/tooltip";
export { Toaster, toast } from "./components/toaster";
export { CopyField, type CopyFieldProps } from "./components/copy-field";

// Tema
export { ThemeProvider, useTheme } from "./components/theme-provider";
export { ThemeToggle } from "./components/theme-toggle";

// Marca
export { ArkiteqMark, type ArkiteqMarkProps } from "./components/arkiteq-mark";
export { NodeGraphBackdrop } from "./components/node-graph-backdrop";
export { WhatsAppIcon } from "./components/whatsapp-icon";

// Documentos al cliente
export { LeyendaNoFiscal, LEYENDA_NO_FISCAL_TEXTO } from "./components/leyenda-no-fiscal";
