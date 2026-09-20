import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./pwa";

// only the PWA build installs a worker (portal builds stay worker-free)
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
