import { useEffect, useMemo, useState } from "react";
import type { TaskProjection } from "@omp/product-contracts";
import { ProductBridgeProvider, useProductBridge } from "./bridge/product-bridge";
import { createFixtureProductBridge } from "./bridge/fixture-product-bridge";
import { LeftRail } from "./ui/left-rail";
import { CenterEmpty } from "./ui/center-empty";
import { RightPanel } from "./ui/right-panel";

function Workbench() {
  const bridge = useProductBridge();
  const [tasks, setTasks] = useState<TaskProjection[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge.listTasks().then((loaded) => {
      if (!cancelled) setTasks(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const selected = useMemo(
    () => tasks?.find((task) => task.taskId === selectedId) ?? null,
    [tasks, selectedId]
  );

  if (tasks === null) {
    return (
      <div className="workbench workbench--loading" role="status">
        正在加载任务…
      </div>
    );
  }

  return (
    <div className="workbench">
      <LeftRail tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} />
      <CenterEmpty />
      <RightPanel task={selected} />
    </div>
  );
}

export function App() {
  // Plan 1 wires the fixture transport only; plan 2 swaps in the real Host
  // transport behind the same ProductBridge interface.
  const bridge = useMemo(() => createFixtureProductBridge(), []);
  return (
    <ProductBridgeProvider bridge={bridge}>
      <Workbench />
    </ProductBridgeProvider>
  );
}
