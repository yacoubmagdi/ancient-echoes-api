import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { verifyPersonaHistorically } from "./verify-persona.server";

export const verifyPersona = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      z
        .object({
          name: z.string().min(1),
          category: z.string().min(1),
          role: z.string().optional(),
          gender: z.string().optional(),
          description: z.string().optional(),
        })
        .parse(data)
  )
  .handler(async ({ data }) => {
    return verifyPersonaHistorically(data);
  });