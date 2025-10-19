import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;

  const initialRecipient = process.env.CONFIDENTIAL_TOKEN_INITIAL_RECIPIENT;
  if (!initialRecipient || !ethers.isAddress(initialRecipient)) {
    throw new Error("CONFIDENTIAL_TOKEN_INITIAL_RECIPIENT not set or invalid");
  }
  console.log("Using initial recipient:", initialRecipient);

  const confidentialToken = await deploy("ConfidentialTokenExample", {
    from: deployer,
    args: [999999, "USDCc", "USDCc", "", initialRecipient],
    log: true,
  });

  const deployedDebtRegistry = await deploy("DebtRegistry", {
    from: deployer,
    args: [confidentialToken.address],
    log: true,
  });

  const tokenInstance = await ethers.getContractAt(
    "ConfidentialTokenExample",
    confidentialToken.address,
    await ethers.getSigner(deployer),
  );
  const tx = await (tokenInstance as any).setTrustedOperator(deployedDebtRegistry.address, true);
  await tx.wait();

  console.log(`DebtRegistry contract: `, deployedDebtRegistry.address);
};
export default func;
func.id = "deploy_debtRegistry"; // id required to prevent reexecution
func.tags = ["DebtRegistry"];
