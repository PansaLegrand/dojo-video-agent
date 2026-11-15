import { describe, expect, it } from "vitest";
import {
  inspectExampleEnvironment,
  inspectLockfile,
  inspectManifest,
  inspectPath,
  inspectSource,
  isRuntimeSource,
} from "../scripts/lib/oss-boundary.mjs";

describe("OSS commercial boundary", () => {
  it.each([
    "next.config.mjs",
    "middleware.ts",
    "instrumentation.ts",
    "apps/server/src/local-api.ts",
  ])("checks infrastructure imports and env in runtime file %s", (file) => {
    expect(isRuntimeSource(file)).toBe(true);
    expect(
      inspectSource(
        'import db from "@vercel/postgres"; const url = process.env.DATABASE_URL;',
        file,
      ),
    ).toHaveLength(2);
  });
  it("allows local persistence, BYOK transports and host-neutral commercial profiles", () => {
    expect(
      inspectManifest(
        {
          dependencies: {
            next: "15",
            openai: "1",
            "@dojo-video/agent-kit": "0.2.9",
          },
        },
        "package.json",
      ),
    ).toEqual([]);
    expect(
      inspectSource(
        'import fs from "node:fs/promises"; const profile = "commercial-editing-v15"; const key = process.env.LLM_API_KEY;',
        "apps/server.ts",
      ),
    ).toEqual([]);
    expect(
      inspectExampleEnvironment(
        "LLM_API_KEY=\nASR_API_KEY=''\nMUSIC_API_KEY=\"\"\nDATA_DIR=.data\nPORT=4310",
        ".env.example",
      ),
    ).toEqual([]);
  });

  it.each([
    "@prisma/client",
    "@vercel/postgres",
    "@neondatabase/serverless",
    "@planetscale/database",
    "@upstash/redis",
    "pg",
    "stripe",
    "@clerk/nextjs",
    "@aws-sdk/client-s3",
    "bullmq",
    "ioredis",
    "@dojoclip/video-project-runtime",
  ])(
    "rejects SaaS dependency %s, including aliases and locked transitive packages",
    (name) => {
      expect(
        inspectManifest({ dependencies: { [name]: "1" } }, "package.json"),
      ).toHaveLength(1);
      expect(
        inspectManifest(
          { optionalDependencies: { alias: `npm:${name}@1.0.0` } },
          "package.json",
        ),
      ).toHaveLength(1);
      expect(
        inspectLockfile(
          {
            packages: {
              [`node_modules/example/node_modules/${name}`]: { version: "1" },
            },
          },
          "package-lock.json",
        ),
      ).toHaveLength(1);
    },
  );

  it("rejects static, dynamic, CommonJS, type and commercial alias imports", () => {
    const source = [
      'import { PrismaClient } from "@prisma/client";',
      'export * from "stripe";',
      'const sdk = import("@aws-sdk/client-s3");',
      'const queue = require("bullmq");',
      'type DB = typeof import("pg");',
      'import credits from "@/lib/credits";',
      'import redis = require("ioredis");',
    ].join("\n");
    expect(inspectSource(source, "apps/server.ts")).toHaveLength(7);
  });

  it("rejects commercial environment access without printing any value", () => {
    const source =
      'const db = process.env.DATABASE_URL; const key = process.env["STRIPE_SECRET_KEY"]; const { REDIS_URL: queue } = process.env;';
    expect(inspectSource(source, "apps/server.ts")).toHaveLength(3);
    const errors = inspectExampleEnvironment(
      "DATABASE_URL=private-connection\nLLM_API_KEY=private-key",
      ".env.example",
    );
    expect(errors).toHaveLength(2);
    expect(errors.join("\n")).not.toMatch(/private-connection|private-key/);
  });

  it.each([
    ".env",
    ".env.production",
    "nested/.env.local",
    ".data/projects.json",
    "prisma/schema.prisma",
    "vercel.json",
    "railway.toml",
  ])("rejects private/config path %s", (file) => {
    expect(inspectPath(file)).toHaveLength(1);
  });

  it.each([
    ".env.example",
    "nested/.env.example",
    ".github/workflows/check.yml",
    "docs/architecture.md",
  ])("permits public documentation and CI path %s", (file) => {
    expect(inspectPath(file)).toEqual([]);
  });
});
