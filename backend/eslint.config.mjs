// Flat ESLint config for the TypeScript ESM backend.
// Pragmatic on purpose: it must be able to run clean on the existing 47k LOC,
// so style opinions stay out and only genuine-bug rules are errors.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "logs/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // Unused code is a real signal — but allow the `_foo` opt-out.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // 37 pre-existing `any`s in data-extraction — surface them, don't block CI.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // ── Pre-existing debt ──
  // These files already violated the rules above when linting was first switched on
  // (`lint` had no config and no eslint dependency, so it had never run). Demoted to
  // warnings so CI is not blocked by code nobody has touched; promote back to error
  // as each file is cleaned up. Do NOT add new paths here.
  {
    files: [
      "src/modules/superadmin/data-extraction/**/*.ts",
      "src/modules/superadmin/platform/routes/users.routes.ts",
      "src/modules/platform-users/services/platform-users.service.ts",
      "src/shared/mail/mailerService.ts",
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "preserve-caught-error": "warn",
      "prefer-const": "warn",
    },
  },

  {
    files: ["tests/**/*.ts"],
    rules: {
      // Tests reach into DB rows and JSON bodies that have no static shape.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
