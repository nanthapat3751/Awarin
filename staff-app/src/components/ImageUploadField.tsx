import { useRef, useState } from "react";

import { ApiError } from "../lib/api";
import { uploadImage } from "../lib/uploads-api";

// ช่องรายการรูปภาพหนึ่งช่อง: อัปโหลดไฟล์ JPEG/PNG/WEBP (เก็บบนเซิร์ฟเวอร์) และ/หรือวาง URL
// ค่าเป็นรายการ URL คั่นด้วยบรรทัดใหม่ — รูปแบบเดียวกับที่ฟอร์มใช้อยู่แล้ว
export function ImageUploadField({
  label,
  value,
  onChange,
  placeholder,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urls = value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const res = await uploadImage(file);
        uploaded.push(res.url);
      }
      onChange([...urls, ...uploaded].join("\n"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(urls.filter((_, i) => i !== index).join("\n"));
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-slate-700">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-xs bg-slate-800 text-white rounded-md px-2 py-1 disabled:opacity-50"
        >
          {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2 my-1">
          {urls.map((url, i) => (
            <div key={`${url}-${i}`} className="relative">
              <img
                src={url}
                alt=""
                className="w-16 h-16 object-cover rounded-md border border-slate-200"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="ลบรูปนี้"
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-300 rounded-md px-2 py-1 text-sm"
        rows={2}
        placeholder={placeholder ?? "อัปโหลดรูป หรือวาง URL บรรทัดละ 1 รูป"}
      />
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
