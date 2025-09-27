import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

try {
  const root = document.getElementById("root");
  if (root) {
    createRoot(root).render(<App />);
  } else {
    console.error("Root element not found");
  }
} catch (error) {
  console.error("Error rendering app:", error);
  document.body.innerHTML = `<div style="padding: 20px; font-family: sans-serif;">
    <h1>Error Loading Application</h1>
    <p>There was an error loading the application. Check the console for details.</p>
    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${error}</pre>
  </div>`;
}
