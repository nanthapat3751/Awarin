import { staffBaseUrl } from "../../lib/access-token";
import { composeMail } from "../../lib/mail-template";
import { sendMail } from "../../lib/mailer";
import { createNotification } from "../../lib/notifications";
import { prisma } from "../../lib/prisma";

/**
 * แจ้งเตือนเมื่อขั้นยืนยันตัวตน 2 ชั้นของพนักงานถูกระงับ (กรอกรหัส 6 หลักผิดครบเพดาน) — ข้อ D ที่ผู้ใช้สั่งทำ 18 ต.ค.
 *
 * ทำไมสำคัญ: จะไปถึงขั้นรหัส 6 หลักได้ต้องกรอกรหัสผ่านถูกก่อน ถูกระงับที่ขั้นนี้ = มีคนอื่นรู้รหัสผ่านแล้ว
 * ช่องทาง (ผู้ใช้เลือก "ทั้งสองทาง"):
 *   ① เจ้าของบัญชี — กระดิ่งในแอป (เห็นตอนเข้าระบบครั้งถัดไป) + อีเมลถ้ามีอีเมลที่ยืนยันแล้ว
 *   ② OWNER/ADMIN คนอื่นทุกคน — กระดิ่งในแอป เพราะพนักงานหลายคนไม่มีอีเมล ต้องมีคนช่วยเห็น
 * ไม่ใส่ไอพีในเมล (เมลส่งออกนอกระบบ) — ดูไอพีได้ในประวัติเข้าสู่ระบบของบัญชี
 */
export async function alertTwoFactorLocked(
  user: { id: string; fullName: string; username: string | null; email: string | null; emailVerifiedAt: Date | null },
  lockedUntil: Date,
): Promise<void> {
  const until = lockedUntil.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const who = user.username ?? user.email ?? user.fullName;

  await createNotification({
    userId: user.id,
    message:
      `มีคนกรอกรหัสผ่านของบัญชีคุณถูก แต่กรอกรหัสยืนยัน 2 ชั้นผิดหลายครั้ง ระบบระงับการยืนยันตัวตนไว้ถึง ${until} น. — ` +
      "ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันที",
    link: "/account#password",
  });

  const others = await prisma.user.findMany({
    where: { role: { in: ["OWNER", "ADMIN"] }, active: true, id: { not: user.id } },
    select: { id: true },
  });
  if (others.length > 0) {
    await prisma.notification.createMany({
      data: others.map((o) => ({
        userId: o.id,
        message:
          `ขั้นยืนยันตัวตน 2 ชั้นของบัญชี ${who} ถูกระงับถึง ${until} น. — มีคนกรอกรหัสผ่านของบัญชีนี้ถูกแต่กรอกรหัสยืนยันผิดหลายครั้ง ` +
          "ควรให้เจ้าของบัญชีเปลี่ยนรหัสผ่าน",
        link: "/users",
      })),
    });
  }

  // อีเมลส่งแบบไม่รอ — ส่งเมลช้า (SMTP) ต้องไม่ทำให้คำตอบ 423 ช้าตาม
  if (user.email && user.emailVerifiedAt) {
    const to = user.email;
    void composeMail("มีคนพยายามเข้าบัญชีของคุณ", {
      preheader: "มีคนกรอกรหัสผ่านของคุณถูก แต่กรอกรหัสยืนยัน 2 ชั้นผิดหลายครั้ง",
      recipientName: user.fullName,
      account: to,
      topic: "มีคนพยายามเข้าบัญชีของคุณ",
      paragraphs: [
        "มีคนกรอกรหัสผ่านของบัญชีคุณถูก แต่กรอกรหัสยืนยัน 2 ชั้นจากแอปผิดหลายครั้ง",
        `ระบบระงับการยืนยันตัวตนของบัญชีนี้ไว้ถึง ${until} น. คนที่ไม่มีโทรศัพท์ของคุณจึงยังเข้าไม่ได้`,
        "ถ้าไม่ใช่คุณ แปลว่ารหัสผ่านของคุณอาจหลุดไปแล้ว ให้เปลี่ยนรหัสผ่านทันที",
      ],
      action: { label: "เปลี่ยนรหัสผ่าน", url: `${staffBaseUrl()}/account#password` },
      notes: ["ถ้าเป็นคุณเองที่พิมพ์รหัสผิด ไม่ต้องทำอะไร รอครบเวลาแล้วเข้าสู่ระบบใหม่ได้"],
    })
      .then((mail) => sendMail({ to, ...mail }))
      .catch(() => undefined);
  }
}
