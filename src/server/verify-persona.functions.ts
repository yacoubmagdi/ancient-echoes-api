import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyPersonaHistorically } from "./verify-persona.server";

const inputSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  role: z.string().optional(),
  gender: z.string().optional(),
  description: z.string().optional(),
});

export const verifyPersona = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    return verifyPersonaHistorically(data);
  });