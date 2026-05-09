import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = path.join(root, "schema");
const generatedDir = path.join(schemaDir, "generated");

function writeJson(filePath, data) {
  return fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const platformEnum = ["web", "android", "ios"];
const commandEnum = [
  "click",
  "type",
  "swipe",
  "assertVisible",
  "screenshot",
  "navigate",
  "hover",
  "press",
  "select",
  "scroll",
  "wait",
  "assertText",
  "getText",
  "back",
  "home",
  "launchApp",
  "terminateApp",
  "custom"
];

function recordLike() {
  return {
    type: "object",
    additionalProperties: true
  };
}

function commandResultSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ada/contracts/command-result.schema.json",
    title: "CommandResult",
    type: "object",
    required: ["requestId", "success"],
    properties: {
      requestId: { type: "string", minLength: 1 },
      success: { type: "boolean" },
      data: recordLike(),
      errorCode: { type: "string" },
      errorMessage: { type: "string" }
    },
    additionalProperties: false
  };
}

function commandEnvelopeSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ada/contracts/command-envelope.schema.json",
    title: "CommandEnvelope",
    type: "object",
    required: ["requestId", "sessionId", "platform", "command"],
    properties: {
      requestId: { type: "string", minLength: 1 },
      sessionId: { type: "string", minLength: 1 },
      platform: { type: "string", enum: platformEnum },
      command: { type: "string", enum: commandEnum },
      payload: recordLike(),
      idempotencyKey: { type: "string" }
    },
    additionalProperties: false
  };
}

function responseEnvelopeSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ada/contracts/response-envelope.schema.json",
    title: "ResponseEnvelope",
    type: "object",
    required: ["requestId", "sessionId", "success"],
    properties: {
      requestId: { type: "string", minLength: 1 },
      sessionId: { type: "string", minLength: 1 },
      success: { type: "boolean" },
      timestamp: { type: "string" },
      result: commandResultSchema(),
      errorCode: { type: "string" },
      errorMessage: { type: "string" }
    },
    additionalProperties: false
  };
}

function eventEnvelopeSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ada/contracts/event-envelope.schema.json",
    title: "EventEnvelope",
    type: "object",
    required: ["eventId", "eventType", "timestamp"],
    properties: {
      eventId: { type: "string", minLength: 1 },
      requestId: { type: "string" },
      sessionId: { type: "string" },
      eventType: { type: "string", minLength: 1 },
      timestamp: { type: "string", minLength: 1 },
      payload: recordLike()
    },
    additionalProperties: false
  };
}

function artifactIndexSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ada/contracts/artifact-index.schema.json",
    title: "ArtifactIndex",
    type: "object",
    required: ["requestId", "items"],
    properties: {
      requestId: { type: "string", minLength: 1 },
      sessionId: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "type", "path"],
          properties: {
            id: { type: "string", minLength: 1 },
            type: { type: "string", enum: ["screenshot", "video", "pageSource", "log"] },
            path: { type: "string", minLength: 1 },
            mimeType: { type: "string" },
            createdAt: { type: "string" }
          },
          additionalProperties: false
        }
      }
    },
    additionalProperties: false
  };
}

async function main() {
  await fs.mkdir(generatedDir, { recursive: true });

  const files = new Map([
    ["command-envelope.schema.json", commandEnvelopeSchema()],
    ["command-result.schema.json", commandResultSchema()],
    ["response-envelope.schema.json", responseEnvelopeSchema()],
    ["event-envelope.schema.json", eventEnvelopeSchema()],
    ["artifact-index.schema.json", artifactIndexSchema()]
  ]);

  for (const [name, schema] of files.entries()) {
    await writeJson(path.join(generatedDir, name), schema);
  }
  await writeJson(path.join(generatedDir, "index.json"), {
    generatedAt: new Date().toISOString(),
    schemas: Array.from(files.keys())
  });
  console.log(`[contracts] schema generated: ${generatedDir}`);
}

main().catch((error) => {
  console.error(`[contracts] schema generate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
