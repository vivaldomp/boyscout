import { runSkillContract } from "@boyscout/bridge-contract-kit";
import { bridge } from "../src/index.js";

runSkillContract(bridge, { expectedId: "material" });
