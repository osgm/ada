const output = {
  serverUrl: process.env.ADA_BOOTSTRAP_SERVER_URL ?? "https://ada-control.example.com",
  tenant: process.env.ADA_BOOTSTRAP_TENANT ?? "default",
  environment: process.env.ADA_BOOTSTRAP_ENV ?? "prod",
  authType: process.env.ADA_BOOTSTRAP_AUTH_TYPE === "device_code" ? "device_code" : "token",
  token: process.env.ADA_BOOTSTRAP_TOKEN ?? "mock-token",
  transportMode: process.env.ADA_BOOTSTRAP_TRANSPORT === "http" ? "http" : "stream",
  streamProtocol: process.env.ADA_BOOTSTRAP_STREAM === "grpc" ? "grpc" : "websocket",
  deviceTags: (process.env.ADA_BOOTSTRAP_TAGS ?? "mock,native")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
};

if (process.env.ADA_BOOTSTRAP_FAIL === "1") {
  console.error("mock native bootstrap forced failure");
  process.exit(2);
}

console.log(JSON.stringify(output));
