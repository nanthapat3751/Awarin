import { Component, type ErrorInfo, type ReactNode } from "react";

import { ChunkLoadError } from "../lib/lazy-page";

/**
 * ตัวกันจอขาว — โค้ดหน้าไหนพังตอนแสดงผล React จะถอดทั้งต้นไม้ทิ้ง ลูกค้าเห็นจอขาวเปล่า
 * (เคยเกิดจริง: ลูกค้าที่มีใบเสนอราคาเปิดหน้าแล้วขาวทั้งจอ) ตัวนี้จับไว้แล้วขึ้นหน้าบอกให้ลองใหม่แทน
 *
 * ใช้สองชั้น:
 *   - variant="page" ครอบเฉพาะเนื้อหาหน้า (ใน App) — พังแค่หน้านั้น แถบเมนู/ฟุตเตอร์ยังอยู่ กดไปหน้าอื่นได้
 *     `resetKey` = pathname ย้ายหน้าแล้วล้างสถานะพังเอง ไม่ค้างหน้าแจ้งไปทุกหน้า
 *   - variant="app" ครอบทั้งแอป (ใน main) — เผื่อแถบเมนู/ฟุตเตอร์พังเอง ไม่มีเมนูให้พึ่ง จึงเต็มจอ
 *
 * จับได้เฉพาะ error ตอนแสดงผล — error จากการเรียก API แต่ละหน้าจัดการเองอยู่แล้ว (ขึ้นข้อความในหน้า)
 */
interface Props {
  variant: "page" | "app";
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: string | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // ย้ายหน้าแล้ว (resetKey เปลี่ยน) ล้างสถานะพังก่อนแสดงผล — หน้าใหม่ไม่ควรโดนหน้าแจ้ง error ของหน้าเก่าบัง
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ไม่มีระบบเก็บ error ฝั่งเบราว์เซอร์ — อย่างน้อยให้เปิด DevTools แล้วเห็นว่าพังที่คอมโพเนนต์ไหน
    console.error("หน้าแสดงผลไม่สำเร็จ:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorFallback
        variant={this.props.variant}
        outdated={error instanceof ChunkLoadError}
        onRetry={() => this.setState({ error: null })}
      />
    );
  }
}

function ErrorFallback({
  variant,
  outdated,
  onRetry,
}: Readonly<{ variant: "page" | "app"; outdated: boolean; onRetry: () => void }>) {
  // โหลดไฟล์ของหน้าไม่ได้ = ส่วนใหญ่เน็ตหลุด หรือเว็บเพิ่งอัปเดต — "ลองใหม่" ต้องรีโหลดทั้งหน้า
  // (แค่ล้างสถานะ React จะเรียกไฟล์เดิมที่ไม่มีแล้วซ้ำ) · พังตอนแสดงผลทั่วไปลองแสดงใหม่ก่อน ไม่ต้องรีโหลด
  const retry = outdated || variant === "app" ? () => window.location.reload() : onRetry;
  const shell =
    variant === "app"
      ? "flex min-h-screen items-center justify-center bg-white px-4"
      : "mx-auto w-full max-w-5xl flex-1 px-4 py-20";

  return (
    <div className={shell} role="alert">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-800 sm:text-3xl">
          {outdated ? "เปิดหน้านี้ไม่สำเร็จ" : "หน้านี้แสดงผลไม่สำเร็จ"}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-600">
          {outdated
            ? "อาจเป็นเพราะสัญญาณอินเทอร์เน็ต หรือเว็บไซต์เพิ่งปรับปรุง กรุณาโหลดหน้าใหม่อีกครั้ง"
            : "เกิดข้อผิดพลาดระหว่างแสดงหน้านี้ ข้อมูลของคุณไม่ได้หายไปไหน ลองอีกครั้ง หรือกลับไปหน้าแรกก่อนได้"}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 py-2.5 font-medium text-white transition-colors hover:bg-brand-dark"
          >
            {outdated || variant === "app" ? "โหลดหน้าใหม่" : "ลองอีกครั้ง"}
          </button>
          {/* <a> ไม่ใช่ <Link>: ชั้น app อยู่นอก Router และถ้าพังเพราะสถานะในแอปเพี้ยน การโหลดใหม่ทั้งหน้าคือทางที่ชัวร์ */}
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            กลับหน้าแรก
          </a>
        </div>
      </div>
    </div>
  );
}
