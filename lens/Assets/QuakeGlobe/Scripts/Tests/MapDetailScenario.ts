// Done criterion 1 - Map detail.
// Reset state; wait for the globe to be placed and its labels to appear. Then assert:
//   1. the "Map Label" pool exists and some labels are visible at the default globe size,
//   2. the plate-boundary meshes exist (subduction barbs, subduction lines, other-class lines),
//   3. growing the globe shows more labels than at the default size (a bigger apparent disc
//      raises the core layout's label budget).
// The globe is resized by setting its handle scale directly, standing in for the two-hand resize.

import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { ScenarioConfig } from "Leaf.lspkg/Scenarios/scenario/ScenarioConfig";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { DefaultLeafInteractor } from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor";
import { hasMesh, labelPoolSize, resetState, setGlobeScale, visibleLabelCount, waitUntil } from "./TestHelpers";

@component
export class MapDetailScenario extends Scenario {
  async run(_config?: ScenarioConfig): Promise<void> {
    const interactor = new DefaultLeafInteractor();
    await resetState(interactor);

    // Start at the default size; labels appear a moment after placement (the layout runs a few
    // times a second, and each new label fades in).
    setGlobeScale(1);
    const someVisible = await waitUntil(() => visibleLabelCount() > 0, 6000);

    expect(labelPoolSize() > 0, "Map label pool objects should exist").toBe(true);
    const atDefault = visibleLabelCount();
    expect(someVisible && atDefault > 0, `Some labels should be visible at the default size - got ${atDefault}`).toBe(true);

    // Plate-boundary meshes exist: the subduction barbs, at least one subduction line chunk, and
    // at least one other-class line chunk.
    expect(hasMesh("Plate subduction barbs"), "Subduction barb mesh should exist").toBe(true);
    expect(hasMesh("Plate subduction line 0"), "Subduction boundary line mesh should exist").toBe(true);
    expect(hasMesh("Plate line 0"), "Other plate-boundary line mesh should exist").toBe(true);

    // A bigger globe shows more labels.
    expect(setGlobeScale(2.5), "Globe handle should exist to resize").toBe(true);
    const grew = await waitUntil(() => visibleLabelCount() > atDefault, 4000);
    const atBig = visibleLabelCount();
    expect(grew && atBig > atDefault, `A bigger globe should show more labels - default ${atDefault}, big ${atBig}`).toBe(true);

    // Restore the default size so later scenarios and the live preview are unaffected.
    setGlobeScale(1);
    await waitUntil(() => visibleLabelCount() <= atBig, 3000);
  }
}
