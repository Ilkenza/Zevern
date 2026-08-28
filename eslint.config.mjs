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
    // Scratch that never ships. It is gitignored, so CI never sees it — but locally it
    // held 1.8 GB of stale Next cache and turned `npm run lint` into 16,000 findings
    // from files nobody wrote, which is the same as having no lint at all.
    "_to_delete/**",
  ]),
]);

export default eslintConfig;
