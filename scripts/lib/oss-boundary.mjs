import ts from "typescript";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
// The local host may use BYOK providers. SaaS accounts, storage, funding and
// queues belong to the commercial host, including its private runtime packages.
const commercialPackages =
  /^(?:@(?:prisma|clerk|auth|stripe|aws-sdk|google-cloud|azure|supabase|dojoclip|neondatabase|planetscale|upstash)\/|@vercel\/postgres(?:\/|$)|(?:prisma|stripe|aws-sdk|pg|postgres|mongodb|mongoose|drizzle-orm|typeorm|sequelize|redis|ioredis|bull|bullmq|next-auth|firebase|firebase-admin)(?:\/|$))/;
const commercialAliases =
  /^@\/(?:lib\/(?:db|billing|credits|stripe)|services\/(?:billing|credits)|prisma)(?:\/|$)/;
const commercialEnvironment =
  /^(?:(?:NEXT_PUBLIC_)?(?:DATABASE|DIRECT|POSTGRES|POSTGRESQL|REDIS|STRIPE|CLERK|SUPABASE|AWS|S3|R2|RAILWAY|WORKER)_|NEXTAUTH_|AUTH_SECRET$)/;
const exampleKeys = new Set([
  "LLM_BASE_URL",
  "LLM_MODEL",
  "LLM_API_KEY",
  "ASR_BASE_URL",
  "ASR_MODEL",
  "ASR_API_KEY",
  "MUSIC_BASE_URL",
  "MUSIC_MODEL",
  "MUSIC_API_KEY",
  "PORT",
  "DATA_DIR",
  "SKILLS_DIR",
]);

export function isRuntimeSource(file) {
  return (
    !/\.(?:test|spec)\./.test(file) &&
    (/^(?:app|apps|packages|config)\/.*\.[cm]?[jt]sx?$/.test(file) ||
      /^(?:next\.config|middleware|instrumentation)\.[cm]?[jt]sx?$/.test(file))
  );
}

export function inspectManifest(manifest, file) {
  const errors = [];
  for (const field of dependencyFields) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      const alias =
        typeof version === "string" && version.startsWith("npm:")
          ? version.slice(4).replace(/@[^@/]*$/, "")
          : "";
      if (commercialPackages.test(name) || commercialPackages.test(alias))
        errors.push(
          `${file}: ${field}.${name} introduces commercial infrastructure.`,
        );
    }
  }
  return errors;
}

export function inspectLockfile(lock, file) {
  const errors = [];
  for (const [location, manifest] of Object.entries(lock.packages ?? {})) {
    const name = location.split("node_modules/").at(-1);
    if (
      commercialPackages.test(name) ||
      commercialPackages.test(manifest.name ?? "")
    )
      errors.push(`${file}: ${location} installs commercial infrastructure.`);
    errors.push(...inspectManifest(manifest, `${file}:${location || "root"}`));
  }
  return errors;
}

export function inspectPath(file) {
  const name = file.replaceAll("\\", "/");
  if (
    /(?:^|\/)\.env(?:\.[^/]+)?$/.test(name) &&
    !name.endsWith("/.env.example") &&
    name !== ".env.example"
  )
    return [`${file}: private environment files must remain untracked.`];
  if (/(?:^|\/)(?:\.data|prisma)(?:\/|$)/.test(name))
    return [
      `${file}: local private state or commercial database schema must remain outside the repository.`,
    ];
  if (/(?:^|\/)(?:vercel\.json|railway\.(?:json|toml))$/.test(name))
    return [
      `${file}: commercial deployment configuration does not belong in the local host.`,
    ];
  return [];
}

export function inspectExampleEnvironment(source, file) {
  const errors = [];
  for (const line of source.split(/\r?\n/)) {
    const entry = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(
      line,
    );
    if (!entry) continue;
    const [, key, raw] = entry;
    if (!exampleKeys.has(key))
      errors.push(
        `${file}: ${key} is outside the documented local/BYOK configuration.`,
      );
    const value = raw.replace(/\s+#.*$/, "").replace(/^(["'])(.*)\1$/, "$2");
    if (/(?:KEY|TOKEN|SECRET|PASSWORD)$/.test(key) && value)
      errors.push(`${file}: ${key} must be blank in the public example.`);
  }
  return errors;
}

export function inspectSource(source, file) {
  const errors = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = new Set();
  const environment = new Set();
  const literal = (node) =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined;
  const isProcessEnv = (node) =>
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env";
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    )
      imports.add(literal(node.moduleSpecifier));
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      imports.add(literal(node.arguments[0]));
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      imports.add(literal(node.argument.literal));
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    )
      imports.add(literal(node.moduleReference.expression));
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression))
      environment.add(node.name.text);
    if (ts.isElementAccessExpression(node) && isProcessEnv(node.expression))
      environment.add(literal(node.argumentExpression));
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isProcessEnv(node.initializer) &&
      ts.isObjectBindingPattern(node.name)
    )
      for (const element of node.name.elements)
        environment.add(
          element.propertyName?.getText(ast).replace(/^["']|["']$/g, "") ??
            element.name.getText(ast),
        );
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const name of imports)
    if (name && (commercialPackages.test(name) || commercialAliases.test(name)))
      errors.push(
        `${file}: commercial import ${name} must stay in the commercial host.`,
      );
  for (const key of environment)
    if (key && commercialEnvironment.test(key))
      errors.push(
        `${file}: commercial environment key ${key} must stay in the commercial host.`,
      );
  return errors;
}
