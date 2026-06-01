import { loadConfig } from "./lib/config.js";
import { describeError } from "./lib/logger.js";
import { createLogger } from "./lib/logger.js";
import { buildFetchOutput } from "./lib/pull.js";
import { writePullToVault } from "./lib/rendering.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  logger.info(
    `Starting sync: ${config.lookbackDays}d window, min ${config.minMessagesPerChat} per chat, log level ${config.logLevel}.`,
  );
  const output = await buildFetchOutput(config, { logger });

  if (output.chats.length === 0) {
    process.stderr.write(
      `No active chats in the last ${config.lookbackDays} days (skipped ${output.skipped.length}).\n`,
    );
    process.stdout.write(JSON.stringify({ path: null, chatCount: 0, messageCount: 0 }) + "\n");
    return;
  }

  const result = writePullToVault(output);

  process.stderr.write(
    [
      `Wrote ${result.path}`,
      `  chats:    ${result.chatCount}`,
      `  messages: ${result.messageCount}`,
      `  window:   ${config.lookbackDays}d, min ${config.minMessagesPerChat} per chat`,
      `  skipped:  ${output.skipped.length}`,
      "",
    ].join("\n"),
  );

  process.stdout.write(
    JSON.stringify({
      path: result.path,
      chatCount: result.chatCount,
      messageCount: result.messageCount,
      windowDays: config.lookbackDays,
      minMessagesPerChat: config.minMessagesPerChat,
      skipped: output.skipped.length,
    }) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(`sync failed: ${describeError(err)}\n`);
  process.exit(1);
});
