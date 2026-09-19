/**
 * พิกัดของเคอร์เซอร์ในช่อง textarea/input — เบราว์เซอร์ไม่มีให้ถามตรง ๆ
 *
 * วิธีคือสร้าง div เงาที่หน้าตาเหมือนช่องนั้นทุกอย่าง (ฟอนต์ ความกว้าง ระยะขอบ การตัดบรรทัด)
 * ใส่ข้อความถึงตำแหน่งเคอร์เซอร์ แล้ววัดว่าตัวอักษรถัดไปไปตกอยู่ตรงไหน
 *
 * ต้องคัดลอกกฎการตัดบรรทัดมาด้วย (white-space / word-break / overflow-wrap) — ภาษาไทยไม่มีช่องว่าง
 * ระหว่างคำ Chrome ตัดบรรทัดด้วยพจนานุกรม ถ้าเงาตัดคนละที่กับช่องจริง กล่องรายการจะเด้งไปผิดบรรทัด
 */

const COPIED = [
  "direction",
  "boxSizing",
  "width",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "wordBreak",
  "overflowWrap",
] as const;

export interface CaretRect {
  /** มุมบนซ้ายของเคอร์เซอร์ เทียบกับกรอบจอ (ใช้กับ position: fixed ได้ทันที) */
  top: number;
  left: number;
  /** ความสูงหนึ่งบรรทัด */
  height: number;
}

export function caretRect(el: HTMLTextAreaElement | HTMLInputElement, position: number): CaretRect {
  const computed = getComputedStyle(el);
  const mirror = document.createElement("div");
  const style = mirror.style;
  const isInput = el.nodeName === "INPUT";

  for (const prop of COPIED) {
    style[prop] = computed[prop];
  }
  style.position = "absolute";
  style.visibility = "hidden";
  style.top = "0";
  style.left = "-9999px";
  style.height = "auto";
  style.whiteSpace = isInput ? "pre" : computed.whiteSpace || "pre-wrap";

  mirror.textContent = el.value.slice(0, position);
  const marker = document.createElement("span");
  // ต้องมีตัวอักษรอย่างน้อยหนึ่งตัว ไม่งั้น span ว่างไม่มีพิกัด
  marker.textContent = el.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeight =
    Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.4;
  const box = el.getBoundingClientRect();
  // offsetTop/Left วัดจากขอบในของกรอบ ส่วน getBoundingClientRect ให้ขอบนอก — ต้องบวกความหนากรอบเข้าไป
  const rect = {
    top: box.top + Number.parseFloat(computed.borderTopWidth) + marker.offsetTop - el.scrollTop,
    left: box.left + Number.parseFloat(computed.borderLeftWidth) + marker.offsetLeft - el.scrollLeft,
    height: lineHeight,
  };
  mirror.remove();
  return rect;
}
