import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ESLint config — Construction Manager
 *
 * Philosophy: enforce rules that catch real bugs at error severity.
 * Stylistic and cleanliness rules are kept at "warn" so they surface
 * in dev but don't fail CI/build. As the codebase matures we will
 * tighten further.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ── TypeScript rules ─────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "off", // pragmatic: too much legacy `any`
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "@typescript-eslint/no-unused-disable-directive": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-require-imports": "error",

      // ── React rules ──────────────────────────────────────────────────
      // These three are real correctness issues — keep at error.
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/prop-types": "off",
      "react-compiler/react-compiler": "off",

      // ── Next.js rules ────────────────────────────────────────────────
      "@next/next/no-img-element": "off",
      "@next/next/no-html-link-for-pages": "off",

      // ── General JavaScript rules ─────────────────────────────────────
      "prefer-const": "warn",
      "no-unused-vars": "off", // use @typescript-eslint/no-unused-vars instead
      "no-console": [
        "warn",
        { allow: ["warn", "error", "info"] },
      ],
      "no-debugger": "error",
      "no-empty": "warn",
      "no-irregular-whitespace": "warn",
      "no-case-declarations": "off",
      "no-fallthrough": "error",
      "no-mixed-spaces-and-tabs": "warn",
      "no-redeclare": "error",
      // `no-undef` is redundant for TypeScript files — tsc catches undefined
      // vars at compile time. ESLint's rule is not JSX/TS-aware and false-
      // positives on common globals like `React`. Disable it.
      "no-undef": "off",
      "no-unreachable": "error",
      "no-useless-escape": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "skills",
      "analysis/**",
      "upload/**",
      "mini-services/**",
      "tool-results/**",
      // Legacy one-off code-mod scripts — kept for history, not run
      "scripts/legacy-codemods/**",
      "scripts/**", // ad-hoc dev scripts, not shipped
      "prisma/seed*.ts", // seed scripts, not shipped
      "vitest.config.ts",
    ],
  },
];

export default eslintConfig;
