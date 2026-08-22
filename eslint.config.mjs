import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * Configuration ESLint « flat » native (eslint-config-next 16+).
 * L'ancien FlatCompat n'est plus nécessaire.
 */
const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", ".selftest/**", ".data/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
