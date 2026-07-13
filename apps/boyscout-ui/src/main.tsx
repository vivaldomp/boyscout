// ponytail: bare bootstrap so `vite build` has a real entry point; Task 6 wires the
// actual App (Renderer + astryxMap) here.
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root) createRoot(root).render(null);
