import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedDebtRegistry = await deploy("DebtRegistry", {
    from: deployer,
    log: true,
  });

  console.log(`DebtRegistry contract: `, deployedDebtRegistry.address);
};
export default func;
func.id = "deploy_debtRegistry"; // id required to prevent reexecution
func.tags = ["DebtRegistry"];
