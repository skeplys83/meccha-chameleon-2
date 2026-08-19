import { createRoot } from "react-dom/client";
import { Game } from "@/client/app/Game";
import "./index.css";

/** The whole client entry point. */
createRoot(document.getElementById("root")!).render(<Game />);
