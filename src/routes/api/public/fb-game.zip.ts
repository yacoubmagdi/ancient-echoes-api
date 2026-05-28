import { createFileRoute } from "@tanstack/react-router";
import { zipSync, strToU8 } from "fflate";
import indexHtml from "../../../../public/game/index.html?raw";
import gameJs from "../../../../public/game/game.js?raw";
import styleCss from "../../../../public/game/style.css?raw";
import fbConfig from "../../../../public/game/fbapp-config.json?raw";
import iconPng from "../../../../public/game/icon.png?arraybuffer";
import coverPng from "../../../../public/game/cover.png?arraybuffer";

export const Route = createFileRoute("/api/public/fb-game/zip")({
  server: {
    handlers: {
      GET: async () => {
        const zipped = zipSync({
          "index.html": strToU8(indexHtml),
          "game.js": strToU8(gameJs),
          "style.css": strToU8(styleCss),
          "fbapp-config.json": strToU8(fbConfig),
          "icon.png": new Uint8Array(iconPng),
          "cover.png": new Uint8Array(coverPng),
        });
        // Copy into a fresh ArrayBuffer to satisfy BodyInit typing
        const body = new Uint8Array(zipped.byteLength);
        body.set(zipped);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              'attachment; filename="ancient-echoes-fb-instant-game.zip"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});