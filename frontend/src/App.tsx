import { useEffect } from "react";
import { TabBar } from "./components/layout/TabBar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { useProjectStore } from "./stores/projectStore";

function EditMode() {
  return (
    <PanelLayout
      left={<div className="placeholder-panel"><span className="section-label">Media Library</span></div>}
      center={<div className="placeholder-panel"><span className="section-label">Timeline / Preview</span></div>}
      right={<div className="placeholder-panel"><span className="section-label">Properties</span></div>}
      bottom={<div className="placeholder-panel"><span className="section-label">Timeline Track</span></div>}
    />
  );
}

function BatchMode() {
  return (
    <PanelLayout
      left={<div className="placeholder-panel"><span className="section-label">File Queue</span></div>}
      center={<div className="placeholder-panel"><span className="section-label">Operations</span></div>}
      right={<div className="placeholder-panel"><span className="section-label">Job Status</span></div>}
    />
  );
}

function ExportMode() {
  return (
    <PanelLayout
      center={<div className="placeholder-panel"><span className="section-label">Export Settings</span></div>}
      right={<div className="placeholder-panel"><span className="section-label">Preview</span></div>}
    />
  );
}

function App() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const initProject = useProjectStore((s) => s.initProject);

  useEffect(() => {
    initProject("Untitled Project").catch(console.error);
  }, [initProject]);

  return (
    <div className="app">
      <TabBar />
      {activeTab === "edit" && <EditMode />}
      {activeTab === "batch" && <BatchMode />}
      {activeTab === "export" && <ExportMode />}
    </div>
  );
}

export default App;
