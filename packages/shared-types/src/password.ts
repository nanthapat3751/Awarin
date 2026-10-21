/**
 * กฎรหัสผ่าน — ที่เดียวสำหรับทั้งสามแอป (server, staff-app, client-app)
 *
 * **ทำไมต้องอยู่ใน shared-types** ถ้าเบราว์เซอร์กับเซิร์ฟเวอร์ตัดสินไม่ตรงกัน จะได้อาการที่
 * แก้ยากที่สุดสองแบบ: ปุ่มกดได้แต่เซิร์ฟเวอร์ปฏิเสธ (คนไม่รู้ว่าผิดอะไร) หรือปุ่มกดไม่ได้แต่
 * เซิร์ฟเวอร์ยอมรับ (กฎที่โชว์เข้มกว่าของจริง) · แบบแผนเดียวกับกฎอีเมล/ชื่อ/เบอร์โทรในแพ็กเกจนี้
 *
 * **กติกาแบบที่เว็บทั่วไปใช้** (ผู้ใช้เลือกเมื่อ 7 ต.ค. 2569 แทนแบบ "ผสม 3 จาก 4 หรือวลี 16 ตัว"
 * เพราะคนเห็นแล้วไม่รู้ว่าต้องพิมพ์อะไร):
 *   ยาว 8 ตัวขึ้นไป · มีตัวพิมพ์ใหญ่ A–Z · มีตัวพิมพ์เล็ก a–z · มีตัวเลข 0–9
 *   · มีอักขระพิเศษอย่างน้อย 1 ตัว (บังคับตั้งแต่ 15 ต.ค. 2569 — เดิมเป็นแค่ "แนะนำ" ผู้ใช้สั่งให้บังคับ)
 *
 * ข้อแลก: วลีภาษาไทยยาว ๆ ไม่ผ่านอีกต่อไป ต้องเติมอังกฤษพิมพ์ใหญ่/เล็กและตัวเลข (ไทยไม่มีตัวพิมพ์)
 *
 * **สิ่งที่กฎนี้ไม่ทำ** ไม่บังคับเปลี่ยนรหัสตามรอบเวลา (NIST เลิกแนะนำแล้ว — คนจะเติมเลขต่อท้าย
 * ไปเรื่อย ๆ) ไม่ห้ามวางทับจากคลิปบอร์ด (จะทำให้ใช้โปรแกรมจำรหัสผ่านไม่ได้) และ **ไม่ใช้ตอนเข้าสู่ระบบ**
 * — บัญชีที่ตั้งรหัสก่อนกฎนี้ต้องเข้าระบบได้ตามเดิม กฎมีผลเฉพาะตอนตั้ง/เปลี่ยนรหัส
 */

/** สั้นที่สุดที่ยอมรับ */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * เพดานความยาว — argon2 กิน CPU ตามความยาวข้อมูลเข้า ไม่มีเพดานเท่ากับเปิดให้ยิงรหัสผ่าน
 * ยาวเป็นเมกะไบต์เข้ามาให้เครื่องแฮชซ้ำ ๆ จนล่ม (NIST กำหนดว่าต้องรับได้อย่างน้อย 64 ตัว)
 */
export const PASSWORD_MAX_LENGTH = 72;

/**
 * ประเภทอักขระที่ต้องมีครบ — อักขระพิเศษบังคับเหมือนกัน แต่ไม่อยู่ในรายการนี้ เพราะ "other"
 * นับภาษาไทยด้วย ข้อนี้ตรวจแยกด้วย hasSymbol (สัญลักษณ์จริงเท่านั้น ไทยไม่นับ)
 */
export const PASSWORD_REQUIRED_CLASSES: readonly PasswordClass[] = ["upper", "lower", "digit"];

/**
 * จำนวนตัวอักษรที่ "ต่างกัน" ขั้นต่ำ — กันรหัสที่ผ่านกฎด้วยการวนตัวเดิม ("Aa1Aa1Aa1" ครบทุกประเภท)
 */
export const PASSWORD_MIN_DISTINCT = 5;

/**
 * ประเภทอักขระ · "other" คืออักขระพิเศษ **และ** ตัวอักษรที่ไม่มีตัวพิมพ์เล็ก/ใหญ่ เช่นภาษาไทย
 * (ภาษาไทยไม่มีระบบตัวพิมพ์ จะจัดเข้า lower/upper ไม่ได้)
 */
export type PasswordClass = "lower" | "upper" | "digit" | "other";

const CLASS_PATTERNS: ReadonlyArray<readonly [PasswordClass, RegExp]> = [
  ["lower", /[a-z]/],
  ["upper", /[A-Z]/],
  ["digit", /\d/],
  ["other", /[^a-zA-Z0-9]/],
];

/** ประเภทอักขระที่พบในรหัสผ่าน (ใช้โชว์รายการติ๊กถูกในหน้าเว็บด้วย) */
export function passwordClasses(value: string): PasswordClass[] {
  return CLASS_PATTERNS.filter(([, re]) => re.test(value)).map(([name]) => name);
}

/**
 * รายการรหัสผ่านที่ถูกเดาบ่อย — ฝังในโค้ดโดยตั้งใจ
 *
 * เลือกฝังแทนการยิงถาม Have I Been Pwned เพราะปลายทางนี้ต้องทำงานได้แม้เน็ตขาด และไม่อยาก
 * ให้การตั้งรหัสผ่านของลูกค้าต้องรอ API ภายนอก (ต้องมีทางถอยเวลามันล่มอยู่ดี) แลกกับการ
 * ครอบคลุมที่แคบกว่ามาก — รายการนี้กันรหัสยอดนิยมได้ ไม่ได้กันรหัสที่หลุดจากเว็บอื่น
 *
 * รวมคำไทยและคำที่เกี่ยวกับบริษัทนี้ด้วย เพราะรายการสากลไม่มีคำพวกนี้เลย
 */
const COMMON_PASSWORD_LIST = `
password passwd passcode pass123 password1 password12 password123 password1234
passw0rd pssword pa55word passwordpassword mypassword newpassword
123456 1234567 12345678 123456789 1234567890 12345 1234 11111111 00000000
111111 000000 121212 123123 112233 456789 654321 666666 777777 888888 999999
123qwe 147258369 159753 963852 987654321 55555555 12341234 10203040
qwerty qwertyui qwertyuiop qwerty123 qwerty12 qweasd qweasdzxc qweqwe
asdfgh asdfghjk asdfghjkl asdasd asdfasdf zxcvbn zxcvbnm zxczxc
1q2w3e 1q2w3e4r 1q2w3e4r5t qazwsx qazwsxedc 1qaz2wsx 2wsx3edc
iloveyou iloveu loveyou loveme lovely lover forever love
letmein letmein1 welcome welcome1 welcome123 hello hello123 helloworld
admin admin1 admin123 admin1234 adminadmin administrator sysadmin webmaster
root toor guest guest123 user user123 username demo demo123
test test123 testtest testing tester changeme default nopassword
secret secret123 abc123 abcd1234 abcdefg abcdefgh aabbccdd
monkey dragon sunshine princess flower butterfly chocolate cookie
football baseball basketball soccer hockey volleyball badminton
superman batman spiderman ironman starwars pokemon minecraft roblox
naruto onepiece dragonball doraemon hellokitty
trustno1 master masterkey shadow ranger hunter buster killer
michael jennifer jordan harley george andrew charlie thomas robert
daniel matthew joshua william richard nicole ashley
computer internet samsung android iphone google facebook twitter youtube
instagram tiktok whatsapp linelogin netflix shopee lazada
whatever nothing anything everything freedom
thailand bangkok chiangmai chiangrai phuket pattaya isaan esan siam
sawadee sawasdee sawadeekrap sawadeekrab sawadeeka krungthep nonthaburi
somchai somsri somying sompong sombat wichai wilai malee manee
narak sabaidee maipenrai khobkhun tuktuk
awarin awarinengineering systemboq boqsystem boqboq
engineer engineering construction contractor builder architect
company office manager supervisor employee staff owner
project projects estimate quotation invoice contract customer
january february march april june july august september october
november december monday sunday summer winter
liverpool arsenal chelsea manutd manchester barcelona realmadrid
bayern juventus everton tottenham
aaaaaaaa bbbbbbbb qwerqwer poiuytrewq lkjhgfdsa mnbvcxz
รหัสผ่าน ผ่านแล้ว สวัสดี สวัสดีครับ สวัสดีค่ะ สวัสดีชาวโลก
ประเทศไทย กรุงเทพ กรุงเทพมหานคร เชียงใหม่ ภูเก็ต พัทยา ขอนแก่น
รักเธอ รักนะ ฉันรักเธอ รักคุณ คิดถึง คิดถึงเธอ ที่รัก
ไม่รู้ ไม่มี ไม่บอก อะไรก็ได้ ทดสอบ ทดลอง ตัวอย่าง ของจริง
ฟหกด ฟหกดเ กขคง กขคงจ อรถจ
สมชาย สมศรี สมหญิง สมพงษ์ สมบัติ วิชัย วิไล มาลี มานี
นารัก สบายดี ขอบคุณ อร่อย
บริษัท สำนักงาน วิศวกร ก่อสร้าง ผู้รับเหมา โครงการ ใบเสนอราคา
`;

/** คำที่ใช้เทียบ — Set เพื่อให้เช็คเร็วและตัดคำซ้ำในรายการข้างบนให้เอง */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  COMMON_PASSWORD_LIST.split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0),
);

/**
 * ตัวเลขและสัญลักษณ์ที่คนใช้แทนตัวอักษร ("leet") — ถอดกลับก่อนเทียบบัญชีดำ
 * ไม่มีขั้นนี้ รหัสอย่าง p-at-ssw0rd จะผ่านหน้าตาเฉย ทั้งที่เป็นคำเดียวกับ password
 */
const LEET_MAP: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
};

function unleet(value: string): string {
  return value.replace(/[013456789@$!+]/g, (ch) => LEET_MAP[ch] ?? ch);
}

/** เหลือแต่ตัวอักษร (ทุกภาษา) — ตัดเลขและสัญลักษณ์ที่คนเติมท้ายเพื่อให้ผ่านกฎออก */
function lettersOnly(value: string): string {
  return value.replace(/[^\p{L}]/gu, "");
}

/**
 * ถ้าค่าเป็นคำสั้น ๆ เอามาต่อกันซ้ำ ๆ คืนคำสั้นนั้น — ไม่ใช่ก็คืน null
 *
 * มีไว้เพราะการพิมพ์คำเดิมสองรอบเป็นวิธียอดนิยมในการทำให้รหัส "ยาวพอ" โดยไม่ได้เดายากขึ้นเลย
 * ("สวัสดีครับสวัสดีครับ" ยาว 20 ตัว ผ่านเกณฑ์วลี แต่เดายากเท่ากับ "สวัสดีครับ" เฉย ๆ)
 */
function repeatedUnit(value: string): string | null {
  const chars = Array.from(value);
  const n = chars.length;
  for (let unit = 1; unit * 2 <= n; unit += 1) {
    if (n % unit !== 0) continue;
    const head = chars.slice(0, unit).join("");
    if (head.repeat(n / unit) === value) return head;
  }
  return null;
}

/** ความยาวของ "ช่วงเรียงติดกัน" ที่เริ่มที่ตำแหน่ง start — ก้าวละ +1, -1 หรือ 0 เท่ากันทั้งช่วง */
function sequentialRunLength(codes: readonly number[], start: number): number {
  if (start + 1 >= codes.length) return 1;
  const step = codes[start + 1] - codes[start];
  if (step !== -1 && step !== 0 && step !== 1) return 1;

  let len = 2;
  while (start + len < codes.length && codes[start + len] - codes[start + len - 1] === step) {
    len += 1;
  }
  return len;
}

/** ช่วงที่สั้นที่สุดที่ยังถือว่าเป็น "ลำดับ" — ต่ำกว่านี้คำทั่วไปจะติดเข้ามาเยอะเกินไป */
const MIN_SEQUENTIAL_RUN = 3;

/**
 * ทั้งเส้นเป็นลำดับเรียงกันหรือไม่ — "1234567890123456", "abcdefghijklmnop", "987654321"
 *
 * บัญชีดำจับได้เฉพาะคำที่ตรงกันทั้งคำ จึงไม่จับลำดับที่ยาวกว่าหรือเริ่มคนละจุดกับที่มีในรายการ
 * (มี "1234567890" แต่ "1234567890123456" ไม่ตรง แล้วมันยาว 16 ตัวจึงผ่านเกณฑ์วลีไปเฉย ๆ)
 *
 * ตัดสินจาก "ทุกช่วงยาวตั้งแต่ 3 ขึ้นไป" ไม่ใช่ "มีช่วงเรียงอยู่ข้างใน" — คำทั่วไปมีตัวอักษรที่
 * เผอิญเรียงกันสามตัวได้ง่าย (เช่น "rst" ใน "riverstone") ถ้าปัดทิ้งด้วยจะกลายเป็นกฎที่คาดเดาไม่ได้
 */
function isSequential(value: string): boolean {
  const codes = Array.from(value, (c) => c.codePointAt(0) ?? 0);
  let i = 0;
  while (i < codes.length) {
    const len = sequentialRunLength(codes, i);
    if (len < MIN_SEQUENTIAL_RUN) return false;
    i += len;
  }
  return true;
}

/**
 * อยู่ในรายการที่เดาบ่อยหรือไม่
 *
 * เทียบ **ทั้งคำ** สามรูปแบบ ไม่ใช่เทียบว่า "มีคำนี้อยู่ข้างใน" — ถ้าเทียบแบบมีอยู่ข้างใน
 * วลียาว ๆ ที่ดีจะถูกปัดทิ้งเพราะเผอิญมีคำว่า love อยู่กลางประโยค
 *   1. ตัวมันเองแบบพิมพ์เล็ก        → จับ 12345678, password123
 *   2. เหลือแต่ตัวอักษร             → จับ Password123! (กลายเป็น password)
 *   3. ถอด leet แล้วเหลือแต่ตัวอักษร → จับ P-at-ssw0rd! (กลายเป็น password)
 *
 * และเทียบทั้งสามรูปแบบนั้นกับ "คำที่ถูกพิมพ์ซ้ำ" ด้วย ถ้าค่าเป็นคำเดิมต่อกันหลายรอบ
 */
function isCommonPassword(value: string): boolean {
  const lower = value.toLowerCase();
  const unit = repeatedUnit(lower);
  const bases = unit === null ? [lower] : [lower, unit];
  const candidates = bases.flatMap((b) => [b, lettersOnly(b), lettersOnly(unleet(b))]);
  // ตัดตัวที่สั้นเกินไปออก — รหัสที่เป็นตัวเลขล้วนจะเหลือสตริงว่างหลังตัดตัวอักษร
  return candidates.some((c) => c.length >= 3 && COMMON_PASSWORDS.has(c));
}

/**
 * ข้อมูลตัวเองที่ห้ามอยู่ในรหัสผ่าน — ชื่อ อีเมล ชื่อผู้ใช้ เบอร์โทร
 * คนที่ใช้ somchai2026! ผ่านกฎผสมอักขระสบาย แต่ใครที่เห็นชื่อในใบเสนอราคาก็เดาได้
 */
function containsPersonalInfo(
  value: string,
  personal: ReadonlyArray<string | null | undefined>,
): boolean {
  const lower = value.toLowerCase();
  const valueDigits = value.replace(/\D/g, "");
  return personal.some((raw) => personalEntryFound(lower, valueDigits, raw));
}

/** ข้อมูลตัวเองหนึ่งช่อง (ชื่อ/อีเมล/ชื่อผู้ใช้/เบอร์) โผล่อยู่ในรหัสผ่านไหม */
function personalEntryFound(lower: string, valueDigits: string, raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return false;

  // อีเมลใช้แค่ส่วนหน้า @ — โดเมน gmail.com ซ้ำกันทุกคน ไม่ใช่ข้อมูลเฉพาะตัว
  const withoutDomain = trimmed.includes("@") ? trimmed.slice(0, trimmed.indexOf("@")) : trimmed;

  // ตัดเป็นคำ ๆ แล้วดูเฉพาะคำยาว 4 ตัวขึ้นไป — คำสั้นอย่าง "ใจ" หรือ "ดี" ไปโผล่ในรหัสที่ดีได้ง่าย
  if (withoutDomain.split(/[\s._@+-]+/).some((token) => token.length >= 4 && lower.includes(token))) return true;

  // เบอร์โทรเทียบแยก: คนกรอกมาได้หลายรูปแบบ (081-234-5678 / +6681...) เทียบเฉพาะตัวเลข
  // และเอาแค่ 6 หลักท้าย เพราะ 08x ขึ้นต้นเหมือนกันแทบทุกเบอร์
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 6 && valueDigits.includes(digits.slice(-6));
}

/** เหตุผลที่รหัสผ่านใช้ไม่ได้ — ไว้ให้เทสต์และหน้าเว็บแยกแยะได้ ไม่ต้องจับคู่ข้อความ */
export type PasswordProblemCode =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "NEEDS_UPPER"
  | "NEEDS_LOWER"
  | "NEEDS_DIGIT"
  | "NEEDS_SYMBOL"
  | "TOO_REPETITIVE"
  | "SEQUENTIAL"
  | "COMMON"
  | "PERSONAL";

export const PASSWORD_PROBLEM_MESSAGES: Readonly<Record<PasswordProblemCode, string>> = {
  TOO_SHORT: `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`,
  TOO_LONG: `รหัสผ่านยาวเกิน ${PASSWORD_MAX_LENGTH} ตัวอักษร`,
  NEEDS_UPPER: "รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A–Z) อย่างน้อย 1 ตัว",
  NEEDS_LOWER: "รหัสผ่านต้องมีตัวพิมพ์เล็ก (a–z) อย่างน้อย 1 ตัว",
  NEEDS_DIGIT: "รหัสผ่านต้องมีตัวเลข (0–9) อย่างน้อย 1 ตัว",
  NEEDS_SYMBOL: "รหัสผ่านต้องมีอักขระพิเศษ เช่น ! @ # อย่างน้อย 1 ตัว",
  TOO_REPETITIVE: "รหัสผ่านใช้ตัวอักษรซ้ำ ๆ กันมากเกินไป ลองใช้ตัวที่ต่างกันมากขึ้น",
  SEQUENTIAL: "รหัสผ่านเป็นตัวอักษรหรือตัวเลขเรียงต่อกัน (เช่น 12345678) เดาง่ายเกินไป",
  COMMON: "รหัสผ่านนี้ถูกเดาบ่อยเกินไป กรุณาเลือกรหัสอื่นที่ไม่ใช่คำที่คนใช้กันทั่วไป",
  PERSONAL: "รหัสผ่านไม่ควรมีชื่อ อีเมล ชื่อผู้ใช้ หรือเบอร์โทรของคุณอยู่ในนั้น",
};

/**
 * ตรวจรหัสผ่านตามกฎทั้งหมด — คืน code ของปัญหาข้อแรกที่เจอ หรือ null ถ้าผ่าน
 *
 * ไล่ตามลำดับ "แก้ง่ายก่อน" โดยตั้งใจ: บอกว่าสั้นเกินไปมีประโยชน์กว่าบอกว่าเป็นรหัสที่เดาบ่อย
 * ทั้งที่มันสั้นด้วย · คืนข้อเดียวไม่คืนทั้งหมด เพราะรายการผิดสี่บรรทัดพร้อมกันทำให้คนท้อ
 *
 * @param personal ชื่อ/อีเมล/ชื่อผู้ใช้/เบอร์โทรของเจ้าของบัญชี ถ้ารู้ — ไม่ส่งมาก็ข้ามข้อนั้นไป
 */
export function passwordProblemCode(
  value: string,
  personal: ReadonlyArray<string | null | undefined> = [],
): PasswordProblemCode | null {
  if (value.length < PASSWORD_MIN_LENGTH) return "TOO_SHORT";
  if (value.length > PASSWORD_MAX_LENGTH) return "TOO_LONG";
  const classes = passwordClasses(value);
  if (!classes.includes("upper")) return "NEEDS_UPPER";
  if (!classes.includes("lower")) return "NEEDS_LOWER";
  if (!classes.includes("digit")) return "NEEDS_DIGIT";
  if (!hasSymbol(value)) return "NEEDS_SYMBOL";
  if (new Set(value).size < PASSWORD_MIN_DISTINCT) return "TOO_REPETITIVE";
  if (isSequential(value)) return "SEQUENTIAL";
  if (isCommonPassword(value)) return "COMMON";
  if (containsPersonalInfo(value, personal)) return "PERSONAL";
  return null;
}

/** เหมือน passwordProblemCode แต่คืนข้อความไทยพร้อมใช้ — null = ผ่าน */
export function passwordProblem(
  value: string,
  personal: ReadonlyArray<string | null | undefined> = [],
): string | null {
  const code = passwordProblemCode(value, personal);
  return code === null ? null : PASSWORD_PROBLEM_MESSAGES[code];
}

/**
 * รายการเงื่อนไขที่โชว์ใต้ช่องรหัสผ่านเป็นติ๊กถูก/วงกลมว่าง — แยกทีละข้อแบบเว็บทั่วไป
 *
 * ข้อ "ต้องมี" เท่านั้น · บัญชีดำกับข้อมูลตัวเองไม่เอามาเป็นรายการติ๊ก เพราะเป็น "ห้ามข้อนี้"
 * — ขึ้นเป็นข้อความเตือนตอนชนจะเข้าใจง่ายกว่าวงกลมว่างที่ไม่รู้ว่าต้องทำอะไรถึงจะเต็ม
 * `optional` = ข้อแนะนำ ไม่ติ๊กก็ส่งได้ (ตอนนี้ไม่มีข้อไหนเป็นแบบนี้แล้ว — อักขระพิเศษกลายเป็นข้อบังคับ)
 */
export interface PasswordRuleState {
  id: "length" | "upper" | "lower" | "digit" | "special";
  label: string;
  ok: boolean;
  optional?: boolean;
}

export function passwordRuleStates(value: string): PasswordRuleState[] {
  const classes = passwordClasses(value);
  return [
    { id: "length", label: `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัวอักษร`, ok: value.length >= PASSWORD_MIN_LENGTH },
    { id: "upper", label: "ตัวพิมพ์ใหญ่ (A–Z)", ok: classes.includes("upper") },
    { id: "lower", label: "ตัวพิมพ์เล็ก (a–z)", ok: classes.includes("lower") },
    { id: "digit", label: "ตัวเลข (0–9)", ok: classes.includes("digit") },
    { id: "special", label: "อักขระพิเศษอย่างน้อย 1 ตัว เช่น ! @ #", ok: hasSymbol(value) },
  ];
}

/**
 * มีอักขระพิเศษ (สัญลักษณ์) ไหม — ไม่นับตัวอักษรไทยแม้ passwordClasses จะจัดไทยเป็น "other"
 * ต้องยกเว้น \p{M} ด้วย: สระบน/ล่างและวรรณยุกต์ไทย (ั ี ่ ้) เป็น "เครื่องหมายประกอบ" ไม่ใช่ \p{L}
 */
function hasSymbol(value: string): boolean {
  return /[^\p{L}\p{M}\p{N}\s]/u.test(value);
}

/**
 * ข้อความสั้นใน placeholder — สั้นพอให้ไม่ถูกตัดบนจอมือถือ 390px · รายละเอียดครบอยู่ในรายการติ๊ก
 * ใต้ช่องที่โผล่ตั้งแต่โฟกัส (ไล่ 4 แบบเต็ม ๆ ในนี้ยาวเกินช่อง ถูกตัดกลางคำ)
 */
export const PASSWORD_HINT = `อย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว ผสมให้ครบ 4 แบบ`;

/**
 * มีตัวอักษรไทยไหม — ใช้เตือนว่ายังเป็นแป้นภาษาไทยอยู่ (พิมพ์ "ฟหกด" แทน "asdf")
 * เป็นแค่คำเตือน ไม่ใช่ข้อห้าม: ไทยยังใส่ในรหัสได้ถ้ามีอังกฤษพิมพ์ใหญ่/เล็กและตัวเลขครบ
 */
export function hasThaiChars(value: string): boolean {
  return /[\u0E00-\u0E7F]/.test(value);
}

/**
 * วัดความแข็งแรงแบบหยาบ ๆ เพื่อ "บอกใบ้" — แถบ 4 ขีดใต้ช่องรหัสผ่าน
 *
 * **แถบนี้ไม่ใช่ตัวตัดสินว่าผ่านหรือไม่ผ่าน** ตัวตัดสินคือ passwordProblem เท่านั้น แถบนี้บอก
 * ว่า "ผ่านแล้วแต่ยังทำให้ดีกว่านี้ได้" เช่นรหัส 8 ตัวที่ผสมครบ — ผ่านกฎ แต่ยังเป็นแค่ "พอใช้"
 *
 * ไม่ใช้ไลบรารีอย่าง zxcvbn เพราะต้องโหลดพจนานุกรมหลายร้อย KB มาไว้ในหน้าเข้าสู่ระบบ
 * ซึ่งเป็นหน้าแรกที่คนเปิด — ไม่คุ้มกับการเดาความแข็งแรงที่แม่นขึ้นเล็กน้อย
 */
export interface PasswordStrength {
  /** 0 = ยังไม่พิมพ์ · 1 = ยังไม่ผ่านกฎ · 2-4 = ผ่านแล้ว ไล่ระดับตามความยาว/ความหลากหลาย */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const STRENGTH_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "ยังไม่ผ่านเกณฑ์",
  2: "พอใช้",
  3: "ดี",
  4: "แข็งแรง",
};

export function passwordStrength(
  value: string,
  personal: ReadonlyArray<string | null | undefined> = [],
): PasswordStrength {
  if (value === "") return { score: 0, label: "" };
  // ยังไม่ผ่านกฎ = ขีดเดียวเสมอ ไม่ต้องคิดคะแนนต่อ — โชว์ "ดี" ให้รหัสที่กดส่งไม่ผ่านคือการโกหก
  if (passwordProblemCode(value, personal) !== null) {
    return { score: 1, label: STRENGTH_LABELS[1] };
  }

  // ผ่านกฎ = พอใช้ · ยาว 12+ ได้อีกขีด · ยาว 16+ ได้อีกขีด (อักขระพิเศษบังคับแล้ว ทุกรหัสที่ผ่านมีหมด
  // จึงไม่ใช้เป็นตัวแยกระดับอีก — ความยาวคือสิ่งที่ทำให้เดายากขึ้นจริง)
  let score = 2;
  if (value.length >= 12) score += 1;
  if (value.length >= 16) score += 1;

  const capped = Math.min(score, 4) as 2 | 3 | 4;
  return { score: capped, label: STRENGTH_LABELS[capped] };
}
