import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("ROOT_CONTAINER_MISSING");
createRoot(container).render(<App />);
