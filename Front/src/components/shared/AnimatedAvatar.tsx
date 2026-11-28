"use client";

import { useRef } from "react";
import { motion, useSpring } from "motion/react";
import { createFace } from "@/lib/avatar-generator";
import { cn } from "@/lib/utils";

interface AnimatedAvatarProps {
  seed: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  ariaLabel?: string;
}

const SIZE_PX = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
};

/**
 * Avatar animado con ojos que siguen el cursor.
 * Usa la misma lógica de generación de rostros del AvatarPicker de Kokonut UI.
 */
export function AnimatedAvatar({
  seed,
  size = "md",
  className,
  ariaLabel,
}: AnimatedAvatarProps) {
  const face = createFace(seed);
  const coinRef = useRef<HTMLDivElement>(null);
  const px = SIZE_PX[size];

  // Living eyes: los ojos siguen el cursor
  const x = useSpring(0, { stiffness: 180, damping: 18 });
  const y = useSpring(0, { stiffness: 180, damping: 18 });

  // Simple eye tracking without full hook (for performance in navbar)
  // Full animation is in the AvatarPicker; here we keep it lightweight
  const bgColor = `rgb(${face.bg[0]} ${face.bg[1]} ${face.bg[2]})`;
  const skinColor = `rgb(${face.skin[0]} ${face.skin[1]} ${face.skin[2]})`;
  const hairColor = `rgb(${face.hair[0]} ${face.hair[1]} ${face.hair[2]})`;
  const shirtColor = `rgb(${face.shirt[0]} ${face.shirt[1]} ${face.shirt[2]})`;
  const inkColor = "#18181b";

  const s = face.shape;
  const cx = 50;
  const cy = 50;
  const eyeY = cy + s.eyeY;
  const mouthY = cy + s.headH * 0.5;
  const glassR = Math.max(s.eyeRx, s.eyeRy) + 3.2;
  const neckTop = cy + s.headH - 6;
  const shoulderTop = cy + s.headH + 3;
  const sw = 30 + s.shoulders * 8;

  const n = (v: number) => Math.round(v * 100) / 100;

  const blobPathStr = (
    cx: number, cy: number, w: number, top: number, bottom: number, square: number, chin = 1
  ) => {
    const k = 0.552 + square * 0.28;
    const kb = k * chin;
    return [
      `M${n(cx)} ${n(cy - top)}`,
      `C${n(cx + k * w)} ${n(cy - top)} ${n(cx + w)} ${n(cy - k * top)} ${n(cx + w)} ${n(cy)}`,
      `C${n(cx + w)} ${n(cy + kb * bottom)} ${n(cx + kb * w)} ${n(cy + bottom)} ${n(cx)} ${n(cy + bottom)}`,
      `C${n(cx - kb * w)} ${n(cy + bottom)} ${n(cx - w)} ${n(cy + kb * bottom)} ${n(cx - w)} ${n(cy)}`,
      `C${n(cx - w)} ${n(cy - k * top)} ${n(cx - k * w)} ${n(cy - top)} ${n(cx)} ${n(cy - top)}Z`,
    ].join("");
  };

  const hairFrontPathStr = (s: typeof face.shape, cx: number, cy: number) => {
    const w = s.headW;
    const h = s.headH;
    const v = s.hairVolume;
    const temple = cy - h * 0.12;
    const crown = cy - h - 1.5 - v * 4;
    const side = w + 1.5 + v * 2.5;
    const k = 0.552 + s.headSquare * 0.28;
    const fringeY = cy - h * (0.66 - s.hairFringe * 0.36);
    const partX = cx + s.hairPart * w * 0.55;
    return [
      `M${n(cx - side)} ${n(temple)}`,
      `C${n(cx - side)} ${n(cy - h * k - v * 3)} ${n(cx - k * side)} ${n(crown)} ${n(cx)} ${n(crown)}`,
      `C${n(cx + k * side)} ${n(crown)} ${n(cx + side)} ${n(cy - h * k - v * 3)} ${n(cx + side)} ${n(temple)}`,
      `L${n(cx + w - 1)} ${n(temple)}`,
      `Q${n(cx + w * 0.75)} ${n(fringeY + 1 - s.hairPart * 5)} ${n(partX)} ${n(fringeY - 2.5)}`,
      `Q${n(cx - w * 0.75)} ${n(fringeY + 1 + s.hairPart * 5)} ${n(cx - w + 1)} ${n(temple)}Z`,
    ].join("");
  };

  const mouthPathStr = (s: typeof face.shape, cx: number, y: number) => {
    const curve = s.mouthCurve * 2;
    const open = s.mouthOpen * 5;
    return [
      `M${n(cx - s.mouthW)} ${n(y)}`,
      `Q${n(cx)} ${n(y + curve)} ${n(cx + s.mouthW)} ${n(y)}`,
      `Q${n(cx)} ${n(y + curve + open)} ${n(cx - s.mouthW)} ${n(y)}Z`,
    ].join("");
  };

  return (
    <span
      role="img"
      aria-label={ariaLabel || `Avatar`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden",
        className,
      )}
      style={{ width: px, height: px }}
      ref={coinRef}
    >
      <svg
        viewBox="12 14 76 76"
        width={px}
        height={px}
        aria-hidden="true"
      >
        <rect fill={bgColor} height="100" width="100" />
        <path d={blobPathStr(cx, cy - s.headH * 0.15, s.headW + 1 + s.hairVolume * 2.5, s.headH * 0.85 + s.hairVolume * 4, s.headH * 0.15 + s.hairLength * (s.headH + 14), s.headSquare * 0.6)} fill={hairColor} opacity="0.9" />
        <path d={`M${n(cx - sw)} 100C${n(cx - sw)} ${n(shoulderTop + 6)} ${n(cx - sw * 0.55)} ${n(shoulderTop)} ${cx} ${n(shoulderTop)}C${n(cx + sw * 0.55)} ${n(shoulderTop)} ${n(cx + sw)} ${n(shoulderTop + 6)} ${n(cx + sw)} 100Z`} fill={shirtColor} />
        <rect fill={skinColor} opacity="0.9" height={n(shoulderTop - neckTop + 3)} rx="3" width="12" x={cx - 6} y={n(neckTop)} />
        <ellipse cx={n(cx - s.headW)} cy={n(cy + 2)} fill={skinColor} opacity="0.95" rx="3" ry="4.5" />
        <ellipse cx={n(cx + s.headW)} cy={n(cy + 2)} fill={skinColor} opacity="0.95" rx="3" ry="4.5" />
        <path d={blobPathStr(cx, cy, s.headW, s.headH, s.headH, s.headSquare, s.chin)} fill={skinColor} />
        <path d={hairFrontPathStr(s, cx, cy)} fill={hairColor} />
        <g fill={inkColor} opacity={n(0.045 * s.cheeks)}>
          <circle cx={n(cx - s.eyeGap - 3)} cy={n(eyeY + 7)} r="3.4" />
          <circle cx={n(cx + s.eyeGap + 3)} cy={n(eyeY + 7)} r="3.4" />
        </g>
        <g stroke={inkColor} strokeLinecap="round" strokeOpacity="0.85" strokeWidth={n(Math.max(0, s.browWeight))} fill="none">
          <path d={`M${n(cx - s.eyeGap - 3.2)} ${n(eyeY - s.browLift + s.browTilt)}L${n(cx - s.eyeGap + 3.2)} ${n(eyeY - s.browLift - s.browTilt)}`} />
          <path d={`M${n(cx + s.eyeGap - 3.2)} ${n(eyeY - s.browLift - s.browTilt)}L${n(cx + s.eyeGap + 3.2)} ${n(eyeY - s.browLift + s.browTilt)}`} />
        </g>
        <motion.g style={{ x, y }}>
          <g style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <ellipse cx={n(cx - s.eyeGap)} cy={n(eyeY)} fill={inkColor} rx={n(s.eyeRx)} ry={n(s.eyeRy)} />
            <ellipse cx={n(cx + s.eyeGap)} cy={n(eyeY)} fill={inkColor} rx={n(s.eyeRx)} ry={n(s.eyeRy)} />
          </g>
        </motion.g>
        <path d={`M${n(cx - 1.5 - s.nose)} ${n(eyeY + 8 + s.nose * 1.5)}Q${cx} ${n(eyeY + 9.5 + s.nose * 1.5)} ${n(cx + 1.5 + s.nose)} ${n(eyeY + 8 + s.nose * 1.5)}`} fill="none" stroke={inkColor} strokeLinecap="round" strokeOpacity="0.35" strokeWidth="1.2" />
        <path d={mouthPathStr(s, cx, mouthY)} fill={inkColor} stroke={inkColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        <g fill="none" opacity={n(Math.max(0, Math.min(1, s.glasses)))} stroke={inkColor} strokeWidth="1.2">
          <circle cx={n(cx - s.eyeGap)} cy={n(eyeY)} r={n(glassR)} />
          <circle cx={n(cx + s.eyeGap)} cy={n(eyeY)} r={n(glassR)} />
          <path d={`M${n(cx - s.eyeGap + glassR)} ${n(eyeY)}Q${cx} ${n(eyeY - 2)} ${n(cx + s.eyeGap - glassR)} ${n(eyeY)}`} />
        </g>
      </svg>
    </span>
  );
}