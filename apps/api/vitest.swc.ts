import swc from "unplugin-swc";

// SWC emits the decorator metadata that Nest's dependency injection reads;
// esbuild, the Vitest default, does not. Shared by the unit and e2e configs.
export const swcPlugin = () =>
  swc.vite({
    module: { type: "es6" },
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
    },
  });
