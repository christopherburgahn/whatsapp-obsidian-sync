import { buildFetchOutput } from "./lib/pull.js";
import { loadConfig } from "./lib/config.js";
import { createLogger, describeError } from "./lib/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info(
    `Starting fetch: ${config.lookbackDays}d window, min ${config.minMessagesPerChat} per chat, log level ${config.logLevel}.`,
  );
  const output = await buildFetchOutput(config, { logger });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`fetch failed: ${describeError(err)}\n`);
  process.exit(1);
});
