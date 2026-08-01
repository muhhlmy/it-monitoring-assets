import { fileURLToPath } from "node:url";

const disabledSetupMessage =
  "Legacy database setup is disabled; no database operation was attempted. " +
  "Re-enable it only after an authorized isolated target, verified backup-and-restore recovery proof, " +
  "and a reviewed versioned migration are available.";

export async function setupDatabase() {
  throw new Error(disabledSetupMessage);
}

const currentFilePath = fileURLToPath(import.meta.url);
const isRunDirectly = process.argv[1] === currentFilePath;

if (isRunDirectly) {
  try {
    await setupDatabase();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
