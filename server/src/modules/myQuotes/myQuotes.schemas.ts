import { z } from "zod";

export const respondToQuoteSchema = z
  .object({
    action: z.enum(["ACCEPT", "REJECT", "REQUEST_REVISION"]),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((data) => data.action !== "REQUEST_REVISION" || !!data.note, {
    message: "กรุณาระบุรายละเอียดที่ต้องการปรับแก้",
    path: ["note"],
  });

export type RespondToQuoteInput = z.infer<typeof respondToQuoteSchema>;
