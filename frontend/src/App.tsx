import { useEffect } from "react";
import { TabBar } from "./components/layout/TabBar";
import { PanelLayout } from "./components/layout/PanelLayout";
import { useProjectStore } from "./stores/projectStore";

// Edit mode
import { MediaBrowser } from "./components/edit/MediaBrowser";
import { PreviewPlayer } from "./components/edit/PreviewPlayer";
import { PropertiesPanel } from "./components/edit/PropertiesPanel";
import { Timeline } from "./components/edit/Timeline";

// Batch mode
import { FileQueue } from "./components/batch/FileQueue";
import { OperationConfig } from "./components/batch/OperationConfig";
import { ProgressPanel } from "./components/batch/ProgressPanel";

// Export mode
import { PreviewSummary } from "./components/export/PreviewSummary";
import { ExportSettings } from "./components/export/ExportSettings";

function EditMode() {
  return (
    <PanelLayout
      left={<MediaBrowser />}
      center={<PreviewPlayer />}
      right={<PropertiesPanel />}
      bottom={<Timeline />}
    />
  );
}

function BatchMode() {
  return (
    <PanelLayout
      left={<FileQueue />}
      center={<OperationConfig />}
      right={<ProgressPanel />}
    />
  );
}

function ExportMode() {
  return (
    <PanelLayout
      left={<PreviewSummary />}
      center={<ExportSettings />}
    />
  );
}

export default function App() {
  const { activeTab, project, initProject } = useProjectStore();

  useEffect(() => {
    if (!project) {
      initProject("Untitled Project");
    }
  }, [project, initProject]);

  return (
    <div className="app">
      <TabBar />
      <div className="app-body">
        {activeTab === "edit" && <EditMode />}
        {activeTab === "batch" && <BatchMode />}
        {activeTab === "export" && <ExportMode />}
      </div>
    </div>
  );
}
