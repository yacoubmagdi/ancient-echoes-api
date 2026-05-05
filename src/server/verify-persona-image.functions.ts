import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyPersonaImage } from "./verify-persona-image.server";

const inputSchema = z.object({
  name: z.string().min(1).max(500),
  role: z.string().max(100).optional(),
  gender: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
  imageUrl: z.string().url().max(2000),
});

export const verifyPersonaImageFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    return verifyPersonaImage(data);
  });