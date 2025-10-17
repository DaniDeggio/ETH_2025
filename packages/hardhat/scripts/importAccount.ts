// @ts-nocheck

import { Wallet } from "ethers";
import { parse, stringify } from "envfile";
import * as fs from "fs";
import password from "@inquirer/password";

const ENV_FILE_PATH = "./.env";

async function requestPassword(prompt: string) {
  return password({ message: prompt });
}

async function getValidatedPassword(): Promise<string> {
  while (true) {
    const first = await requestPassword("Enter a password to encrypt your private key:");
    const confirmation = await requestPassword("Confirm password:");

    if (first === confirmation) {
      return first;
    }

    console.log("❌ Passwords don't match. Please try again.");
  }
}

async function getWalletFromPrivateKey(): Promise<Wallet> {
  while (true) {
    const pk = await requestPassword("Paste your private key:");
    try {
      return new Wallet(pk);
    } catch (error) {
      console.log("❌ Invalid private key format. Please try again.");
    }
  }
}

async function writeEnvFile(config: Record<string, string>) {
  fs.writeFileSync(ENV_FILE_PATH, stringify(config));
}

async function importWallet(existingEnv: Record<string, string> = {}) {
  console.log("👛 Importing Wallet\n");

  const wallet = await getWalletFromPrivateKey();
  const passwordValue = await getValidatedPassword();
  const encryptedJson = await wallet.encrypt(passwordValue);

  const nextEnv = {
    ...existingEnv,
    DEPLOYER_PRIVATE_KEY_ENCRYPTED: encryptedJson,
  };

  await writeEnvFile(nextEnv);

  console.log("\n📄 Encrypted Private Key saved to packages/hardhat/.env file");
  console.log("🪄 Imported wallet address:", wallet.address, "\n");
  console.log("⚠️ Make sure to remember your password! You'll need it to decrypt the private key.");
}

async function main() {
  if (!fs.existsSync(ENV_FILE_PATH)) {
    await importWallet();
    return;
  }

  const envContent = parse(fs.readFileSync(ENV_FILE_PATH).toString()) as Record<string, string>;

  if (envContent.DEPLOYER_PRIVATE_KEY_ENCRYPTED) {
    console.log("⚠️ You already have a deployer account. Check the packages/hardhat/.env file");
    return;
  }

  await importWallet(envContent);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
