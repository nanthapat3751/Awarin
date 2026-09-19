import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from "react";

type SpecularSize = "sm" | "md" | "lg";

interface SpecularButtonProps {
  children: ReactNode;
  /** ใส่ href = เรนเดอร์เป็น <a> (ใช้กับลิงก์สมอ เช่น #about) ไม่ใส่ = <button> ปกติ */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  size?: SpecularSize;
  /** ความโค้งมุม (px) — ต้องเป็นตัวเลข เพราะ shader ใช้ค่านี้วาดเส้นขอบด้วย */
  radius?: number;
  /** สีพื้นปุ่ม */
  tint?: string;
  /** ความทึบของพื้น 0–1 (0 = ใสมองทะลุ, 1 = ทึบ) */
  tintOpacity?: number;
  /** เบลอฉากหลังที่มองทะลุปุ่ม (px) — ใช้คู่กับ tintOpacity ต่ำ ๆ */
  blur?: number;
  textColor?: string;
  /** สีแสงที่วิ่งบนขอบ */
  lineColor?: string;
  /** สีเส้นขอบพื้นฐาน (ทำให้ปุ่มดูมีความหนา) */
  baseColor?: string;
  /** ความสว่างของแสงสะท้อน */
  intensity?: number;
  /** ระยะที่เมาส์เข้าใกล้แล้วแสงเริ่มติด (px) */
  proximity?: number;
  className?: string;
}

// ความสูงขั้นต่ำ 44px = เกณฑ์ปุ่มกดด้วยนิ้ว (ตัวอักษรใช้ leading-none ปุ่มจึงเตี้ยกว่าที่คิด)
const SIZES: Record<SpecularSize, string> = {
  sm: "text-xs px-4 py-2 min-h-10",
  md: "text-sm px-6 py-3 min-h-11",
  lg: "text-base px-8 py-3.5 min-h-12",
};

/** เผื่อขอบผ้าใบรอบปุ่ม ให้แสงที่ฟุ้งออกนอกขอบไม่ถูกตัด */
const PAD = 20;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = sdRoundedRect(p, uHalfSize, uRadius);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // เส้นขอบพื้นฐานสีเข้มแนบขอบปุ่ม ทำให้รู้สึกว่าปุ่มมีความหนา
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  // แสงสะท้อนแบบสมมาตร: ขอบด้านที่หันเข้าและหันออกจากแหล่งแสงจะติดแสงทั้งคู่
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

/**
 * ปุ่มที่มีแสงสะท้อนวิ่งบนขอบตามตำแหน่งเมาส์ (specular = แสงวาวบนผิววัสดุ)
 * ดัดแปลงจาก Specular Button ของ React Bits (MIT) — วาดเฉพาะ "ขอบ" ด้วย WebGL shader
 * ส่วนพื้นปุ่ม/ตัวอักษรยังเป็น DOM ปกติ จึงคัดลอกข้อความและอ่านด้วย screen reader ได้ตามเดิม
 *
 * สิ่งที่เพิ่มจากต้นฉบับ (จำเป็นสำหรับเว็บจริง):
 * - เรนเดอร์เป็น <a> ได้ ไม่ใช่แค่ <button>
 * - prefers-reduced-motion → ไม่เปิด WebGL เลย เหลือปุ่มสีพื้นเรียบ ๆ ที่ใช้งานได้เหมือนเดิม
 * - หยุดวาดเมื่อปุ่มเลื่อนพ้นจอหรือสลับแท็บ (เดิมวนทุกเฟรมตลอดเวลา เปลืองแบตเปล่า ๆ)
 * - เครื่อง/เบราว์เซอร์ที่ไม่รองรับ WebGL2 → ข้ามเอฟเฟกต์ ไม่พังทั้งหน้า
 */
export function SpecularButton({
  children,
  href,
  onClick,
  size = "md",
  radius = 14,
  tint = "#1a237e",
  tintOpacity = 1,
  blur = 0,
  textColor = "#ffffff",
  lineColor = "#ffffff",
  baseColor = "#0f1657",
  intensity = 1,
  proximity = 250,
  className = "",
}: Readonly<SpecularButtonProps>) {
  const rootRef = useRef<HTMLElement>(null);
  const fxRef = useRef<HTMLSpanElement>(null);
  // อ่านค่า props ล่าสุดจากใน loop โดยไม่ต้องสร้าง WebGL context ใหม่ทุกครั้งที่ re-render
  const liveRef = useRef({ radius, lineColor, baseColor, intensity, proximity });
  liveRef.current = { radius, lineColor, baseColor, intensity, proximity };

  useEffect(() => {
    const el = rootRef.current;
    const fx = fxRef.current;
    if (!el || !fx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = window.devicePixelRatio || 1;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
    } catch {
      return; // ไม่มี WebGL — ปล่อยให้เป็นปุ่มสีพื้นธรรมดา
    }
    const gl = renderer.gl;
    // shader ชุดนี้เขียนด้วย GLSL ES 3.00 ซึ่งคอมไพล์ได้เฉพาะบน WebGL2
    if (!renderer.isWebgl2) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: dpr },
        uBaseWidth: { value: dpr },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    fx.appendChild(gl.canvas);

    const box = { w: 1, h: 1 };
    const resize = () => {
      // ใช้ขนาดทศนิยมจาก getBoundingClientRect + กำหนดจุดกึ่งกลางเอง เพื่อให้เส้นขอบที่ shader
      // วาดทับพอดีกับขอบ CSS จริง (ถ้าใช้ offsetWidth ที่ปัดเป็นจำนวนเต็ม เส้นจะเหลื่อมได้ถึง 1px)
      const rect = el.getBoundingClientRect();
      box.w = rect.width;
      box.h = rect.height;
      renderer.setSize(box.w + PAD * 2, box.h + PAD * 2);
      program.uniforms.uCenter.value = [(PAD + box.w / 2) * dpr, (PAD + box.h / 2) * dpr];
      program.uniforms.uHalfSize.value = [(box.w / 2) * dpr, (box.h / 2) * dpr];
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // มุมของแสงเอียงตามตำแหน่งเมาส์บนหน้าจอ ถ้ายังไม่ขยับเมาส์เลยจะกวาดช้า ๆ ไปเรื่อย ๆ
    let pointerAngle: number | null = null;
    let proximityT = 0;
    let onScreen = true;
    const onPointerMove = (e: PointerEvent) => {
      if (!onScreen) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.hypot(dx, dy);
      if (dist === 0) {
        // เมาส์อยู่บนปุ่ม: แสงไปเกาะแนวทแยง (ขับมุมปุ่ม) แล้วแกว่งตามตำแหน่งเมาส์เล็กน้อย
        const nx = (e.clientX - cx) / (rect.width / 2);
        const ny = (cy - e.clientY) / (rect.height / 2);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
      } else {
        pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx);
      }
      const t = Math.max(0, 1 - dist / Math.max(liveRef.current.proximity, 1));
      proximityT = t * t * (3 - 2 * t);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0;
    let last = performance.now();
    let raf = 0;

    const lineC = new Color();
    const baseC = new Color();

    const update = (now: number) => {
      raf = requestAnimationFrame(update);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = liveRef.current;

      idleAngle += 0.35 * dt;
      const target = pointerAngle ?? idleAngle;
      // หมุนเข้าหามุมเป้าหมายทางที่สั้นกว่าเสมอ (ไม่วนอ้อมรอบวง)
      const diff = ((target - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      angle += diff * (1 - Math.exp(-dt * 7));
      bright += (proximityT - bright) * (1 - Math.exp(-dt * 8));

      lineC.set(p.lineColor);
      baseC.set(p.baseColor);
      program.uniforms.uAngle.value = angle;
      program.uniforms.uRadius.value = Math.min(p.radius, Math.min(box.w, box.h) / 2) * dpr;
      program.uniforms.uLineColor.value = [lineC.r, lineC.g, lineC.b];
      program.uniforms.uBaseColor.value = [baseC.r, baseC.g, baseC.b];
      program.uniforms.uIntensity.value = p.intensity * bright;
      renderer.render({ scene: mesh });
    };

    const start = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(update);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => (onScreen && !document.hidden ? start() : stop());

    // หน้าแรกยาวหลายจอ — ไม่ต้องวาดต่อเมื่อปุ่มเลื่อนพ้นสายตาหรือผู้ใช้สลับแท็บไปแล้ว
    const io = new IntersectionObserver((entries) => {
      onScreen = entries.at(-1)?.isIntersecting ?? false;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    start();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", onPointerMove);
      if (gl.canvas.parentNode === fx) gl.canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  const classes = [
    "relative inline-flex items-center justify-center cursor-pointer border-none no-underline",
    "font-medium leading-none tracking-[0.01em] outline-none",
    "transition-transform duration-150 active:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.25)]",
    "[color:var(--sb-text)] [border-radius:var(--sb-radius)]",
    "[background:color-mix(in_srgb,var(--sb-tint)_calc(var(--sb-tint-opacity)*100%),transparent)]",
    "[backdrop-filter:blur(var(--sb-blur))]",
    SIZES[size],
    className,
  ]
    .join(" ")
    .trim();

  const style = {
    "--sb-radius": `${radius}px`,
    "--sb-tint": tint,
    "--sb-tint-opacity": tintOpacity,
    "--sb-blur": `${blur}px`,
    "--sb-text": textColor,
  } as CSSProperties;

  const inner = (
    <>
      <span
        ref={fxRef}
        aria-hidden="true"
        className="pointer-events-none absolute -inset-5 z-[1] [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
      />
      <span className="relative z-[2]">{children}</span>
    </>
  );

  if (href) {
    return (
      <a
        ref={rootRef as React.RefObject<HTMLAnchorElement>}
        href={href}
        onClick={onClick}
        className={classes}
        style={style}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      ref={rootRef as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      className={classes}
      style={style}
    >
      {inner}
    </button>
  );
}
