import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { reviewSourceMatchBatch, deletePersonasByIds } from "@/server/review-source-match.server";

export const reviewSourceMatch = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).optional(),
        category: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    return reviewSourceMatchBatch(data.ids, data.category);
  });

export const deleteSelectedPersonas = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    return deletePersonasByIds(data.ids);
  });
