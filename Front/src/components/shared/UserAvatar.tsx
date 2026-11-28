"use client";

import { cn } from "@/lib/utils";
import { SafeImage } from "@/components/shared/SafeImage";
import { AnimatedAvatar } from "@/components/shared/AnimatedAvatar";
import type { AuthUser } from "@/types/auth";

interface UserAvatarProps {
  user: AuthUser | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  ariaLabel?: string;
}

const SIZE_CLASSES = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  xl: "size-16",
};

const INITIALS_SIZE_CLASSES = {
  xs: "text-[10px]",
  sm: "text-[12px]",
  md: "text-[14px]",
  lg: "text-[18px]",
  xl: "text-[24px]",
};

/**
 * Obtiene las iniciales del usuario.
 * Prioridad: name + lastName > username > "UP"
 */
function getInitials(user: AuthUser): string {
  const name = user.name?.trim();
  const lastName = user.lastName?.trim();
  const username = user.username?.trim();

  if (name && lastName) {
    return (name[0] + lastName[0]).toUpperCase();
  }
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return "UP";
}

/**
 * Determina la imagen a mostrar según la prioridad:
 * 1. Imagen propia del usuario (user.image)
 * 2. Imagen del proveedor social (ya viene en user.image si aplica)
 * 3. Iniciales (fallback)
 *
 * Nota: El backend ya popula `user.image` con la foto de Google/Facebook
 * cuando el usuario inició sesión con esos proveedores y no tiene imagen propia.
 */
function getAvatarImage(user: AuthUser): string | null {
  return user.image ?? null;
}

function getAriaLabel(user: AuthUser | null, customLabel?: string): string {
  if (customLabel) return customLabel;
  if (!user) return "Avatar de usuario";
  const name = user.name?.trim();
  const username = user.username?.trim();
  const displayName = name || username || "Usuario";
  return `Avatar de ${displayName}`;
}

export function UserAvatar({
  user,
  size = "md",
  className,
  ariaLabel,
}: UserAvatarProps) {
  const initials = user ? getInitials(user) : "UP";
  const imageSrc = user ? getAvatarImage(user) : null;
  const label = getAriaLabel(user, ariaLabel);
  const hasImage = Boolean(imageSrc);

  const sizeClass = SIZE_CLASSES[size];
  const initialsSizeClass = INITIALS_SIZE_CLASSES[size];

  // Si la imagen es un avatar animado (prefijo "avatar:"), renderizar el componente animado
  const isAnimatedAvatar = imageSrc?.startsWith("avatar:") ?? false;
  const avatarSeed = isAnimatedAvatar ? imageSrc!.replace("avatar:", "") : null;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-coffee/10 ring-2 ring-cream/20 transition-all duration-200",
        sizeClass,
        className,
      )}
    >
      {isAnimatedAvatar && avatarSeed ? (
        <AnimatedAvatar
          seed={avatarSeed}
          size={size}
          ariaLabel={label}
          className="w-full h-full"
        />
      ) : hasImage && imageSrc ? (
        <SafeImage
          src={imageSrc}
          alt={label}
          className="h-full w-full object-cover"
          eager={size === "xs" || size === "sm"}
        />
      ) : (
        <span
          className={cn(
            "font-heading font-semibold text-coffee-deep select-none",
            initialsSizeClass,
          )}
          aria-hidden="true"
        >
          {initials}
        </span>
      )}
    </span>
  );
}