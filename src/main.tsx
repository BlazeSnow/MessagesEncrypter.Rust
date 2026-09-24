import { invoke } from "@tauri-apps/api/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { initI18n } from "./i18n";
import "./index.css";
import "./App.css";

async function bootstrap() {
  // 语言偏好独立于密钥库完整性，必须最先初始化。
  let preference: string | null = null;
  try {
    preference = await invoke<string>("get_language_preference");
  } catch {
    preference = null;
  }
  await initI18n(preference);

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
