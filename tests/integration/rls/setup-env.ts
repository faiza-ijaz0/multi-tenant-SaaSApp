import { existsSync } from "node:fs";
import { resolve } from "node:path";

// .env.local carries the public URL/anon key the app itself uses.
// .env.test.local carries the test-only service-role key (never NEXT_PUBLIC_,
// never committed — see tests/integration/README.md).
for (const file of [".env.local", ".env.test.local"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
