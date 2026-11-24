import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-react", "@babel/preset-typescript"],
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
