import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEV_URL = "http://127.0.0.1:4173";
const OUTPUT_DIR = "docs/media";
const WINDOW_WIDTH = 1600;
const WINDOW_HEIGHT = 900;
const BASE_FLAGS = [
  "--headless=new",
  "--disable-gpu",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-default-apps",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`,
];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);

    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener(
        "error",
        (event) => {
          reject(event.error ?? new Error("WebSocket connection failed"));
        },
        { once: true },
      );
    });

    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }

        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
          return;
        }

        pending.resolve(message.result ?? {});
        return;
      }

      const handlers = this.listeners.get(message.method);
      if (!handlers) {
        return;
      }

      for (const handler of handlers) {
        handler(message.params ?? {});
      }
    });
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) ?? new Set();
    handlers.add(handler);
    this.listeners.set(method, handlers);

    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(method);
      }
    };
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (!this.ws) {
      return;
    }

    this.ws.close();
    await sleep(50);
  }
}

async function waitForDebuggerTarget(port, expectedUrl, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const pageTarget = targets.find((target) =>
        target.type === "page" && String(target.url).startsWith(expectedUrl)
      );

      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome may not have opened its debugging endpoint yet.
    }

    await sleep(200);
  }

  throw new Error(`Timed out waiting for debugger target for ${expectedUrl}`);
}

async function waitForSceneReady(cdp) {
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.bringToFront");

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const readyState = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    const canvasCount = await cdp.send("Runtime.evaluate", {
      expression: "document.querySelectorAll('canvas').length",
      returnByValue: true,
    });

    if (readyState.result?.value === "complete" && canvasCount.result?.value > 0) {
      break;
    }

    await sleep(200);
  }

  await sleep(2500);
}

async function captureScreenshot(cdp, outputPath) {
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
}

async function dispatchKey(cdp, {
  type,
  key,
  code,
  keyCode,
  text = "",
}) {
  await cdp.send("Input.dispatchKeyEvent", {
    type,
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    text,
    unmodifiedText: text,
  });
}

async function captureFrameSequence(cdp, frameDir, frameCount, frameDelayMs) {
  mkdirSync(frameDir, { recursive: true });
  for (let index = 0; index < frameCount; index += 1) {
    await captureScreenshot(cdp, join(frameDir, `${String(index + 1).padStart(4, "0")}.png`));
    if (index < frameCount - 1) {
      await sleep(frameDelayMs);
    }
  }
}

async function withChrome(url, remotePort, callback) {
  const profileDir = mkdtempSync(join(tmpdir(), "character-ctrlr-chrome-"));
  const chrome = spawn(
    "google-chrome",
    [
      ...BASE_FLAGS,
      `--remote-debugging-port=${remotePort}`,
      `--user-data-dir=${profileDir}`,
      url,
    ],
    {
      stdio: "ignore",
    },
  );

  try {
    const wsUrl = await waitForDebuggerTarget(remotePort, url);
    const cdp = new CdpSession(wsUrl);
    await cdp.connect();

    try {
      await waitForSceneReady(cdp);
      return await callback(cdp);
    } finally {
      await cdp.close();
    }
  } finally {
    chrome.kill("SIGKILL");
    await sleep(250);
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const framesDir = join(OUTPUT_DIR, "active-ragdoll-walk-attempt-frames");
  rmSync(framesDir, { recursive: true, force: true });

  await withChrome(`${DEV_URL}/?player=capsule`, 9222, async (cdp) => {
    await captureScreenshot(cdp, join(OUTPUT_DIR, "capsule-baseline.png"));
  });

  await withChrome(`${DEV_URL}/?player=ragdoll`, 9223, async (cdp) => {
    await captureScreenshot(cdp, join(OUTPUT_DIR, "active-ragdoll-wip.png"));

    await dispatchKey(cdp, {
      type: "rawKeyDown",
      key: "w",
      code: "KeyW",
      keyCode: 87,
      text: "w",
    });
    await captureFrameSequence(cdp, framesDir, 16, 180);
    await dispatchKey(cdp, {
      type: "keyUp",
      key: "w",
      code: "KeyW",
      keyCode: 87,
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
