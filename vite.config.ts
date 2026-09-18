import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    rolldownOptions: {
      onwarn(warning, warn) {
        // This desktop SPA has no server components; Base UI's React Server
        // Component boundaries have no meaning here. Keep all other warnings.
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes("use client") &&
          warning.id?.includes("/node_modules/@base-ui/")
        )
          return;
        warn(warning);
      },
    },
  },
});
