#!/usr/bin/env node

import chalk from "chalk";
import { execSync } from "child_process";
import { Command } from "commander";
import fs from "fs";
import path from "path";
import { install } from "./index.js";
import { VALID_CLIENTS } from "./types.js";
import { normalizePath, recreateShadcnRegistryJson } from "./utils.js";
// Note: Native fetch is available in Node.js v18+.
// If older Node version, consider using a library like node-fetch.

const program = new Command();

export const MANIFEST_FILENAME = "21st-registry.json";
export const SHADCN_REGISTRY_FILENAME = "registry.json";

export interface ManifestEntry {
  name: string; // From registry-item.json or the direct name provided
  sourceUrl?: string; // The URL it was fetched from, if applicable
  sourceType: "url_success" | "direct_name" | "url_fetch_failed";
  registryItem?: any; // The actual fetched JSON content if sourceType is 'url_success'
  fetchError?: string; // Error message if sourceType is 'url_fetch_failed'
  addedByCLI: true;
}

program
  .name("21st-dev-cli")
  .description("Install MCP configuration for various AI clients")
  .version("1.0.0");

program
  .command("install")
  .description("Install MCP configuration for a specific client")
  .argument(
    "<client>",
    `The client to install for (${VALID_CLIENTS.join(", ")})`
  )
  .option("--api-key <key>", "API key for 21st.dev services")
  .action(async (client: string, options: { apiKey?: string }) => {
    if (!VALID_CLIENTS.includes(client as any)) {
      console.error(
        chalk.red(
          `Invalid client "${client}". Available clients: ${VALID_CLIENTS.join(
            ", "
          )}`
        )
      );
      process.exit(1);
    }

    try {
      await install(client as any, { apiKey: options.apiKey });
    } catch (error) {
      console.error(
        chalk.red(
          error instanceof Error ? error.message : "Unknown error occurred"
        )
      );
      process.exit(1);
    }
  });

program
  .command("add")
  .description(
    "Add a new UI component using shadcn/ui and update the registry."
  )
  .argument(
    "<componentIdentifier>",
    "Component name (e.g., button) or URL to component's registry JSON (e.g., https://21st.dev/r/...)"
  )
  .option("--no-install", "Prevent installation of dependencies by shadcn/ui")
  .action(
    async (componentIdentifier: string, options: { install?: boolean }) => {
      const manifestPath = path.join(process.cwd(), MANIFEST_FILENAME);
      let newEntry: ManifestEntry | null = null;

      console.log(
        chalk.blue(`Processing component: ${componentIdentifier}...`)
      );

      try {
        // Check if componentIdentifier is a URL
        let isUrl = false;
        try {
          const url = new URL(componentIdentifier);
          isUrl = url.protocol === "http:" || url.protocol === "https:";
        } catch (_) {
          // Not a valid URL, treat as a direct name
        }

        if (isUrl) {
          console.log(
            chalk.blue(
              `Fetching component details from ${componentIdentifier}...`
            )
          );
          try {
            const response = await fetch(componentIdentifier);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch: ${response.status} ${response.statusText}`
              );
            }
            const registryItem = await response.json();
            if (!registryItem.name) {
              console.warn(
                chalk.yellow(
                  "Warning: Fetched JSON does not have a 'name' property. Using identifier as name."
                )
              );
            }
            newEntry = {
              name: registryItem.name || componentIdentifier,
              sourceUrl: componentIdentifier,
              sourceType: "url_success",
              registryItem: registryItem,
              addedByCLI: true,
            };
            console.log(
              chalk.green(
                `Successfully fetched details for "${newEntry.name}".`
              )
            );
          } catch (fetchError) {
            const errorMessage =
              fetchError instanceof Error
                ? fetchError.message
                : String(fetchError);
            console.error(
              chalk.red(
                `Error fetching component details from URL: ${errorMessage}`
              )
            );
            newEntry = {
              name: componentIdentifier, // Use the URL itself as a fallback name
              sourceUrl: componentIdentifier,
              sourceType: "url_fetch_failed",
              fetchError: errorMessage,
              addedByCLI: true,
            };
          }
        } else {
          // Treat as a direct component name
          newEntry = {
            name: componentIdentifier,
            sourceType: "direct_name",
            addedByCLI: true,
          };
          console.log(
            chalk.blue(
              `Treating "${componentIdentifier}" as a direct component name.`
            )
          );
        }

        // Now, attempt to add with shadcn/ui CLI
        // We pass the original componentIdentifier to shadcn
        console.log(
          chalk.blue(`Running shadcn add for "${componentIdentifier}"...`)
        );
        let shadcnCommand = `npx ${
          !options.install ? "-y --no-install" : "-y"
        } shadcn add --overwrite ${componentIdentifier}`;

        execSync(shadcnCommand, {
          stdio: "inherit",
        });
        console.log(
          chalk.green(
            `shadcn add command completed for "${componentIdentifier}".`
          )
        );

        // Update manifest only if shadcn add was successful and we have an entry to add
        if (newEntry) {
          let manifest: ManifestEntry[] = [];
          try {
            if (fs.existsSync(manifestPath)) {
              const fileContent = fs.readFileSync(manifestPath, "utf-8");
              manifest = JSON.parse(fileContent);
              if (!Array.isArray(manifest)) {
                console.warn(
                  chalk.yellow(
                    `Warning: Manifest file ${MANIFEST_FILENAME} was malformed. Initializing a new one.`
                  )
                );
                manifest = [];
              }
            }
          } catch (error) {
            console.warn(
              chalk.yellow(
                `Warning: Could not read/parse ${MANIFEST_FILENAME}. Initializing. Error: ${
                  error instanceof Error ? error.message : String(error)
                }`
              )
            );
            manifest = [];
          }

          // Check for duplicates based on 'name' field of the newEntry
          const isDuplicate = manifest.some(
            (entry) =>
              entry.name === newEntry!.name &&
              entry.sourceType === newEntry!.sourceType
          );

          if (!isDuplicate) {
            manifest.push(newEntry);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            console.log(
              chalk.cyan(
                `"${newEntry.name}" has been added/updated in ${MANIFEST_FILENAME}.`
              )
            );
          } else {
            console.log(
              chalk.cyan(
                `"${newEntry.name}" (type: ${newEntry.sourceType}) was already tracked in ${MANIFEST_FILENAME}.`
              )
            );
          }
        }
      } catch (error) {
        // This catch block now primarily handles errors from execSync or other unexpected errors
        console.error(
          chalk.red(
            `Failed to process component "${componentIdentifier}". Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
        if (
          error &&
          typeof (error as any).status === "number" &&
          (error as any).status !== 0
        ) {
          process.exit((error as any).status);
        }
        process.exit(1); // General fallback exit
      }
    }
  );

program
  .command("analyze")
  .description(
    "Analyze a GitHub repository using Octolens analyzemyrepo service"
  )
  .argument(
    "[repository]",
    "GitHub repository in format owner/repo (e.g., facebook/react). Defaults to current repository."
  )
  .option("--open", "Open the analysis in browser")
  .action(async (repository: string | undefined, options: { open?: boolean }) => {
    const OCTOLENS_BASE_URL = "https://analyzemyrepo.com";

    let repoToAnalyze = repository;

    // If no repository provided, try to detect from git remote
    if (!repoToAnalyze) {
      try {
        const gitRemote = execSync("git remote get-url origin", {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();

        // Parse GitHub URL formats:
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        const httpsMatch = gitRemote.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
        const sshMatch = gitRemote.match(/github\.com:([^\/]+)\/([^\/\.]+)/);

        if (httpsMatch) {
          repoToAnalyze = `${httpsMatch[1]}/${httpsMatch[2]}`;
        } else if (sshMatch) {
          repoToAnalyze = `${sshMatch[1]}/${sshMatch[2]}`;
        }

        if (repoToAnalyze) {
          console.log(chalk.blue(`Detected repository: ${repoToAnalyze}`));
        }
      } catch {
        // Not in a git repo or no remote configured
      }
    }

    if (!repoToAnalyze) {
      console.error(
        chalk.red(
          "Could not detect repository. Please provide a repository in format owner/repo (e.g., facebook/react)"
        )
      );
      process.exit(1);
    }

    // Validate repository format
    if (!repoToAnalyze.match(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)) {
      console.error(
        chalk.red(
          `Invalid repository format: "${repoToAnalyze}". Expected format: owner/repo`
        )
      );
      process.exit(1);
    }

    const analysisUrl = `${OCTOLENS_BASE_URL}/analyze/${repoToAnalyze}`;

    console.log(chalk.green(`\n🔍 Octolens Repository Analysis`));
    console.log(chalk.cyan(`Repository: ${repoToAnalyze}`));
    console.log(chalk.cyan(`Analysis URL: ${analysisUrl}\n`));

    if (options.open) {
      console.log(chalk.blue("Opening in browser..."));
      try {
        // Cross-platform open command
        const openCommand =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
            ? "start"
            : "xdg-open";

        execSync(`${openCommand} "${analysisUrl}"`, {
          stdio: "ignore",
        });
        console.log(chalk.green("Browser opened successfully!"));
      } catch {
        console.log(
          chalk.yellow(
            `Could not open browser automatically. Please visit the URL above.`
          )
        );
      }
    } else {
      console.log(
        chalk.gray("Tip: Use --open flag to open the analysis in your browser")
      );
    }
  });

program
  .command("remove")
  .description(
    "Remove a component and its unused dependencies (components and npm packages)"
  )
  .argument("<componentName>", "The name of the component to remove")
  .option("--dry-run", "Show what would be deleted without actually deleting")
  .option("--working-dir <dir>", "Working directory for component files", "src")
  .action(
    async (
      componentName: string,
      options: { dryRun?: boolean; workingDir?: string }
    ) => {
      const manifestPath = path.join(process.cwd(), MANIFEST_FILENAME);
      const workingDir = options.workingDir || "src";

      console.log(
        chalk.blue(`Preparing to remove component: ${componentName}`)
      );
      console.log(chalk.blue(`Working directory: ${workingDir}`));

      try {
        // Read the manifest
        let manifest: ManifestEntry[] = [];
        if (!fs.existsSync(manifestPath)) {
          console.error(
            chalk.red(`Manifest file ${MANIFEST_FILENAME} not found.`)
          );
          process.exit(1);
        }

        try {
          const fileContent = fs.readFileSync(manifestPath, "utf-8");
          manifest = JSON.parse(fileContent);
          if (!Array.isArray(manifest)) {
            console.error(
              chalk.red(`Manifest file ${MANIFEST_FILENAME} is malformed.`)
            );
            process.exit(1);
          }
        } catch (error) {
          console.error(
            chalk.red(
              `Could not read/parse ${MANIFEST_FILENAME}. Error: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          );
          process.exit(1);
        }

        // Find the component to remove
        const componentToRemove = manifest.find(
          (entry) => entry.name === componentName
        );
        if (!componentToRemove) {
          console.error(
            chalk.red(`Component "${componentName}" not found in manifest`)
          );
          process.exit(1);
        }

        console.log(
          chalk.blue(`Found component "${componentName}" in manifest`)
        );

        // Step 1: Count usage for all file paths across all components
        const fileUsageCount = new Map<string, number>();
        const componentFiles = new Map<string, string[]>();
        const registryItems = new Map<string, any>();

        // Helper function to collect files from registry item (including its dependencies)
        const processRegistryItem = async (
          url: string,
          registryItem: any
        ): Promise<string[]> => {
          if (componentFiles.has(url)) {
            return componentFiles.get(url) || [];
          }

          let files: string[] = [];

          // Collect files from the registry item
          if (registryItem.files) {
            registryItem.files.forEach((file: any) => {
              if (file && file.path) {
                files.push(normalizePath(workingDir, file.path));
              }
            });
          }

          // Collect files from registry dependencies
          if (registryItem.registryDependencies) {
            for (const depUrl of registryItem.registryDependencies) {
              try {
                if (!registryItems.has(depUrl)) {
                  console.log(
                    chalk.gray(`Fetching registry dependency: ${depUrl}`)
                  );

                  const response = await fetch(depUrl);
                  if (response.ok) {
                    const depData = await response.json();
                    registryItems.set(depUrl, depData);
                  }
                } else {
                  console.log(
                    chalk.gray(`Using cached registry dependency: ${depUrl}`)
                  );
                }

                const depData = registryItems.get(depUrl);
                const depFiles = await processRegistryItem(depUrl, depData);
                files.push(...depFiles);
              } catch (error) {
                console.warn(
                  chalk.yellow(
                    `Warning: Could not fetch registry dependency ${depUrl}: ${
                      error instanceof Error ? error.message : String(error)
                    }`
                  )
                );
              }
            }
          }

          files = [...new Set(files)];
          componentFiles.set(url, files);

          return files;
        };

        // Count usage across all components
        for (const entry of manifest) {
          if (entry.registryItem) {
            registryItems.set(entry.name, entry.registryItem);
            await processRegistryItem(entry.name, entry.registryItem);
          }
        }

        // Count file usage after all components are processed
        for (const [_, files] of componentFiles) {
          files.forEach((filePath) => {
            fileUsageCount.set(
              filePath,
              (fileUsageCount.get(filePath) || 0) + 1
            );
          });
        }

        console.log(chalk.blue(`Found dependencies:`));
        for (const [name, files] of componentFiles) {
          const text = `${name}:\n  - ${files
            .map((f) => `${f} (${fileUsageCount.get(f)} usages)`)
            .join("\n  - ")}`;
          console.log(
            name === componentToRemove.name
              ? chalk.yellow(text)
              : chalk.gray(text)
          );
        }

        // Step 2: Remove files that are only used by the component being deleted
        const registryItemsToDelete = new Set<string>();
        const markFilesToDelete = (url: string) => {
          if (registryItemsToDelete.has(url)) {
            return;
          }
          registryItemsToDelete.add(url);
          console.log(chalk.gray(`${url}:`));

          const files = componentFiles.get(url) || [];
          files.forEach((path: any) => {
            console.log(chalk.gray(`  - ${path}`));
            const count = fileUsageCount.get(path) || 0;
            fileUsageCount.set(path, count - 1);
          });

          const deps = registryItems.get(url)?.registryDependencies || [];
          for (const depUrl of deps) {
            markFilesToDelete(depUrl);
          }
        };

        console.log(
          chalk.blue(`Marking files to delete for ${componentToRemove.name}`)
        );
        markFilesToDelete(componentToRemove.name);

        const filesToDelete: string[] = (
          componentFiles.get(componentToRemove.registryItem.name) || []
        ).filter((file) => {
          const needToDelete = fileUsageCount.get(file) === 0;
          if (!needToDelete) {
            console.log(
              chalk.yellow(
                `Keeping file ${file} (${fileUsageCount.get(
                  file
                )} other usages)`
              )
            );
          }
          return needToDelete;
        });

        // Delete the files
        let deletedCount = 0;
        for (const filePath of filesToDelete) {
          let formattedPath = normalizePath(workingDir, filePath);
          const fullPath = path.join(process.cwd(), formattedPath);

          try {
            if (fs.existsSync(fullPath)) {
              if (options.dryRun) {
                console.log(
                  chalk.green(`Would delete (dry run): ${formattedPath}`)
                );
              } else {
                fs.unlinkSync(fullPath);
                console.log(chalk.green(`Deleted: ${formattedPath}`));
              }
              deletedCount++;
            } else {
              console.log(chalk.gray(`File not found: ${formattedPath}`));
            }
          } catch (error) {
            console.error(
              chalk.red(
                `Failed to delete ${path.join(workingDir, filePath)}: ${
                  error instanceof Error ? error.message : String(error)
                }`
              )
            );
          }
        }

        // Remove the component from manifest
        if (!options.dryRun) {
          const updatedManifest = manifest.filter(
            (entry) => entry.name !== componentToRemove.name
          );
          fs.writeFileSync(
            manifestPath,
            JSON.stringify(updatedManifest, null, 2)
          );

          // Recreate shadcn registry
          recreateShadcnRegistryJson();
        }

        console.log(
          chalk.green(
            `Successfully removed component "${componentName}", deleted ${deletedCount} file(s).`
          )
        );
        console.log(
          chalk.cyan(
            `Updated ${MANIFEST_FILENAME} and ${SHADCN_REGISTRY_FILENAME}.`
          )
        );
      } catch (error) {
        console.error(
          chalk.red(
            `Failed to remove component "${componentName}". Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          )
        );
        process.exit(1);
      }
    }
  );

program.parse();
