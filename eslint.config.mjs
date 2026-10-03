import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees of parallel sessions live inside the repo (`.claude/worktrees/*`)
    // and carry their own `.next/` output; lint the main tree only.
    ".claude/worktrees/**",
    // Copias exportadas de Claude Design (runtime ajeno, no es código de la app).
    "design/**",
    // El laberinto de /party y su three.js: módulos de Claude Design servidos tal cual desde public/.
    "public/party/laberinto/**",
    "public/party/vendor/**",
    // Transpilado de src/app/party/party-drone.ts por scripts/sync-party-design.py (para la página estática del Mausoleo).
    "public/party/party-drone.js",
  ]),
]);

export default eslintConfig;
