import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deploySimpleStorage = await deploy("SimpleStorage", {
    from: deployer,
    log: true,
  });

  console.log(`SimpleStorage contract: `, deploySimpleStorage.address);
};
export default func;
func.id = "deploy_simpleStorage"; // id required to prevent reexecution
func.tags = ["SimpleStorage"];
