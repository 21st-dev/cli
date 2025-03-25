import type { ValidClient, InstallOptions } from "./types.js";
import { DEFAULT_CONFIG, createMagicArgs } from "./config.js";
import { writeConfig } from "./utils.js";
import { promptForRestart } from "./client.js";
import ora from "ora";
import chalk from "chalk";

export async function install(
  client: ValidClient,
  options?: InstallOptions
): Promise<void> {
  const spinner = ora(`Installing configuration for ${client}...`).start();

  try {
    const config = { ...DEFAULT_CONFIG };

    if (options?.apiKey) {
      config.servers["@21st-dev/magic"].args = createMagicArgs(options.apiKey);
    }

    writeConfig(client, config);
    spinner.succeed(`Successfully installed configuration for ${client}`);

    if (!options?.apiKey) {
      console.log(
        chalk.yellow(
          "No API key provided. Using default 'YOUR_API_KEY' placeholder."
        )
      );
    }

    console.log(chalk.green(`${client} configuration updated successfully`));
    await promptForRestart(client);
  } catch (error) {
    spinner.fail(`Failed to install configuration for ${client}`);
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    throw error;
  }
}
