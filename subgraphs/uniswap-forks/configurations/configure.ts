// import { log} from "@graphprotocol/graph-ts";
import { getNetworkConfigurations } from "./configurations/configurations";
import { Deploy } from "./configurations/deploy";

// Select the deployment protocol and network
const deployment = Deploy.PANGOLIN_AVALANCHE;

// export const NetworkConfigs = configurationsMap.get(deployment)!
export const NetworkConfigs = getNetworkConfigurations(deployment);
