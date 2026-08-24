import { BerthFactory } from "./berth";
import { BoatProfileFactory } from "./boat-profile";
import { ImpactIncidentFactory } from "./impact-incident";
import { MarinaLayoutFactory } from "./marina-layout";
import { SpawnPointFactory } from "./spawn-point";

/** Keys are the model names the recipe uses. */
export const factories = {
  BoatProfile: BoatProfileFactory,
  MarinaLayout: MarinaLayoutFactory,
  Berth: BerthFactory,
  SpawnPoint: SpawnPointFactory,
  ImpactIncident: ImpactIncidentFactory,
};
