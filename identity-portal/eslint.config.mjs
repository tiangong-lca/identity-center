import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * 依赖边界(设计文档 04-project-structure-design §依赖边界):
 * - components/features 是前端层,禁止触达 server 与服务端 lib(keycloak/db/mq/...)
 * - server/repositories 只碰 db,禁止 Keycloak Admin API(必须经 service)
 * - app 可组装 features/components,app/api 经 server/services 编排
 */
const boundariesConfig = {
  files: ["**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "import/resolver": {
      typescript: { alwaysTryTypes: true },
    },
    "boundaries/elements": [
      { type: "app", pattern: "app/**/*", mode: "full" },
      { type: "features", pattern: "features/**/*", mode: "full" },
      { type: "components", pattern: "components/**/*", mode: "full" },
      { type: "lib-db", pattern: "lib/db/**/*", mode: "full" },
      { type: "lib-kit", pattern: "lib/business-app-kit/**/*", mode: "full" },
      {
        type: "lib-server",
        pattern:
          "lib/{keycloak,audit,mq,rate-limit,permissions,sync,auth,security}/**/*",
        mode: "full",
      },
      {
        type: "lib-shared",
        pattern: "lib/{http,validation,i18n,config,crypto}/**/*",
        mode: "full",
      },
      { type: "server-services", pattern: "server/services/**/*", mode: "full" },
      { type: "server-repositories", pattern: "server/repositories/**/*", mode: "full" },
      { type: "server-policies", pattern: "server/policies/**/*", mode: "full" },
      { type: "server-jobs", pattern: "server/jobs/**/*", mode: "full" },
      { type: "db", pattern: "db/**/*", mode: "full" },
      { type: "types", pattern: "types/**/*", mode: "full" },
      { type: "i18n", pattern: ["i18n/**/*", "messages/**/*"], mode: "full" },
      { type: "scripts", pattern: "scripts/**/*", mode: "full" },
      { type: "tests", pattern: "tests/**/*", mode: "full" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        rules: [
          {
            from: { type: "app" },
            allow: {
              to: {
                type: [
                  "app",
                  "features",
                  "components",
                  "types",
                  "i18n",
                  "lib-shared",
                  "lib-server",
                  "lib-db",
                  "server-services",
                  "server-policies",
                ],
              },
            },
          },
          {
            from: { type: "features" },
            allow: {
              to: { type: ["features", "components", "types", "i18n", "lib-shared"] },
            },
          },
          {
            from: { type: "components" },
            allow: { to: { type: ["components", "types", "i18n", "lib-shared"] } },
          },
          {
            from: { type: "server-services" },
            allow: {
              to: {
                type: [
                  "server-services",
                  "server-repositories",
                  "server-policies",
                  "lib-server",
                  "lib-shared",
                  "lib-db",
                  "db",
                  "types",
                ],
              },
            },
          },
          {
            from: { type: "server-repositories" },
            allow: {
              to: { type: ["server-repositories", "lib-db", "lib-shared", "db", "types"] },
            },
          },
          {
            from: { type: "server-policies" },
            allow: {
              to: { type: ["server-policies", "lib-server", "lib-shared", "lib-db", "db", "types"] },
            },
          },
          {
            from: { type: "server-jobs" },
            allow: {
              to: {
                type: [
                  "server-jobs",
                  "server-services",
                  "lib-server",
                  "lib-shared",
                  "lib-db",
                  "db",
                  "types",
                ],
              },
            },
          },
          {
            from: { type: "lib-server" },
            allow: { to: { type: ["lib-server", "lib-shared", "lib-db", "db", "types"] } },
          },
          {
            from: { type: "lib-shared" },
            allow: { to: { type: ["lib-shared", "types", "i18n"] } },
          },
          {
            from: { type: "lib-kit" },
            allow: { to: { type: ["lib-kit", "lib-server", "lib-shared", "types"] } },
          },
          {
            from: { type: "lib-db" },
            allow: { to: { type: ["lib-db", "lib-shared", "db", "types"] } },
          },
          { from: { type: "db" }, allow: { to: { type: ["db", "types"] } } },
          { from: { type: "i18n" }, allow: { to: { type: ["i18n", "types"] } } },
          {
            from: { type: "scripts" },
            allow: {
              to: {
                type: [
                  "scripts",
                  "lib-server",
                  "lib-shared",
                  "lib-db",
                  "server-services",
                  "server-repositories",
                  "server-jobs",
                  "db",
                  "types",
                  "i18n",
                ],
              },
            },
          },
          {
            from: { type: "tests" },
            allow: {
              to: {
                type: [
                  "tests",
                  "app",
                  "features",
                  "components",
                  "lib-server",
                  "lib-shared",
                  "lib-db",
                  "lib-kit",
                  "server-services",
                  "server-repositories",
                  "server-policies",
                  "server-jobs",
                  "db",
                  "types",
                  "i18n",
                  "scripts",
                ],
              },
            },
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  boundariesConfig,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
