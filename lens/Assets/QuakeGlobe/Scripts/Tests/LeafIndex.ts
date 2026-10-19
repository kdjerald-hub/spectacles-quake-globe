// LEAF scenario registry for the Live Quake Globe Lens.
//
// Attach this component to a root SceneObject named "LeafIndex". When the component loads, the
// @scenariosIndex static initializer registers every scenario below with the LEAF ScenarioManager,
// making them runnable from the LEAF panel. The import of each scenario class both pulls it into
// the build and gives @component a type name for createComponent().

import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator";
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata";

import { MapDetailScenario } from "./MapDetailScenario";
import { QuakeDetailsScenario } from "./QuakeDetailsScenario";
import { AlertScenario } from "./AlertScenario";
import { SafeSpotArrowScenario } from "./SafeSpotArrowScenario";
import { EmergencyContactsScenario } from "./EmergencyContactsScenario";
import { HomeMarkerScenario } from "./HomeMarkerScenario";

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenarios: ScenarioMetadata[] = [
    { id: "map_detail", typename: MapDetailScenario.getTypeName() },
    { id: "quake_details", typename: QuakeDetailsScenario.getTypeName() },
    { id: "alert", typename: AlertScenario.getTypeName() },
    { id: "safe_spot_arrow", typename: SafeSpotArrowScenario.getTypeName() },
    { id: "emergency_contacts", typename: EmergencyContactsScenario.getTypeName() },
    { id: "home_marker", typename: HomeMarkerScenario.getTypeName() },
  ];
}
