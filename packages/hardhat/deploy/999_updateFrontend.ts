import { DeployFunction } from "hardhat-deploy/types";
import generateTsAbis from "../scripts/generateTsAbis";

const updateFrontend: DeployFunction = async function (hre) {
  await generateTsAbis(hre);
};

export default updateFrontend;

updateFrontend.tags = ["update-frontend"];
updateFrontend.runAtTheEnd = true;
