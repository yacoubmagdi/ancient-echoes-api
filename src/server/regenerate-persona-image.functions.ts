import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { regeneratePersonaImageServer } from "./regenerate-persona-image.server";

export const regeneratePersonaImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ personaId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    return regeneratePersonaImageServer(data.personaId);
  });