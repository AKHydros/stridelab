import { type ElementType, type HTMLAttributes, forwardRef, useCallback, useImperativeHandle, useRef } from "react";

type GlassProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** Apply the refraction lens (used sparingly, on controls, as in iOS). */
  lens?: boolean;
  strong?: boolean;
};

/**
 * A Liquid Glass surface: translucent material, rim light and a specular
 * highlight that follows the pointer.
 */
export const Glass = forwardRef<HTMLElement | null, GlassProps>(function Glass({ as: Tag = "div", className = "", children, lens, strong, ...rest }, outer) {
  const ref = useRef<HTMLElement>(null);
  useImperativeHandle(outer, () => ref.current as HTMLElement, []);
  const onMove = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
  return (
    <Tag ref={ref} onPointerMove={onMove} className={`glass ${lens ? "lens" : ""} ${strong ? "strong" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
});

/**
 * SVG displacement filter referenced by `backdrop-filter: url(#lg-refract)`.
 * Low-frequency noise bends the backdrop like a thick glass edge.
 */
export function LiquidGlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="lg-refract" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="11" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="46" xChannelSelector="R" yChannelSelector="G" result="bent" />
        <feGaussianBlur in="bent" stdDeviation="0.6" />
      </filter>
    </svg>
  );
}

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

/** Only Chromium renders SVG filters inside backdrop-filter; others get frosted glass. */
export function supportsRefraction(): boolean {
  if (typeof navigator === "undefined") return false;
  // `userAgentData` only exists in Chromium-based browsers.
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  return brands.some((b) => /Chromium/.test(b.brand));
}
