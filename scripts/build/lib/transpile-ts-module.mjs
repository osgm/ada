import ts from "typescript";

/**
 * Transpile a TypeScript module to ESM JavaScript (types erased).
 * @param {string} source
 * @param {string} fileName
 */
export function transpileTsModule(source, fileName = "module.ts") {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: false
    },
    fileName
  });
  return outputText.replace(/\/\/# sourceMappingURL=.*\n?/g, "").trim();
}

/** Strip leading sync header comment for drift checks. */
export function stripSyncHeader(content) {
  return content.replace(/^\/\*\*[\s\S]*?\*\/\s*/u, "").trim();
}
