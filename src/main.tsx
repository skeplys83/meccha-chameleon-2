import { createRoot } from "react-dom/client";
import { Game } from "@/game/Game";
import "./index.css";

/** The whole client entry point. */
createRoot(document.getElementById("root")!).render(<Game />);
