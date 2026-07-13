import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/astryx.css";
import { App } from "./App.js";
import { makeClient, readToken } from "./api.js";

const client = makeClient(readToken(window.location.search));
const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App client={client} /></StrictMode>);
