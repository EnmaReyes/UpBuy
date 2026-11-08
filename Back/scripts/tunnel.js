// Levanta dos túneles públicos (cloudflared quick tunnels) hacia la API y el
// frontend locales, para poder probar Wompi en local:
//
//   - Wompi exige HTTPS con dominio público en "URL de Eventos" (rechaza
//     localhost y http).
//   - Wompi bloquea las redirecciones a localhost, por eso WOMPI_REDIRECT_URL
//     debe ser la URL pública del frontend.
//
// Uso (desde Api/):   npm run tunnel
//                     API_PORT=3000 WEB_PORT=5173 npm run tunnel
//
// Luego:
//   1. Copia la URL del túnel "api" como "URL de Eventos" en el panel de Wompi:
//        https://<api>/api/payments/webhook
//   2. Copia la URL del túnel "web" en Api/.env.local:
//        WOMPI_REDIRECT_URL=https://<web>
//      y reinicia la API.
//
// Las URLs cambian cada vez que se reinicia el túnel.

const { spawn, spawnSync } = require("child_process");

const API_PORT = process.env.API_PORT || "3000";
const WEB_PORT = process.env.WEB_PORT || "5173";

// Comprueba que cloudflared esté instalado antes de nada.
const probe = spawnSync("cloudflared", ["--version"], { encoding: "utf8" });
if (probe.error) {
  console.error(
    "No se encontró 'cloudflared'.\n" +
      "  Instálalo con:  winget install --id Cloudflare.cloudflared\n" +
      "  O descárgalo de: https://github.com/cloudflare/cloudflared/releases",
  );
  process.exit(1);
}

const targets = [
  { name: "api", port: API_PORT, url: null, child: null },
  { name: "web", port: WEB_PORT, url: null, child: null },
];

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

const printSummary = () => {
  const [api, web] = targets;
  console.log("\n================= TUNELES LISTOS =================");
  if (api.url) {
    console.log(`API   : ${api.url}`);
    console.log(`   Wompi -> URL de Eventos: ${api.url}/api/payments/webhook`);
  } else {
    console.log("API   : (esperando URL...)");
  }
  if (web.url) {
    console.log(`FRONT : ${web.url}`);
    console.log(`   Api/.env.local -> WOMPI_REDIRECT_URL=${web.url}`);
  } else {
    console.log("FRONT : (esperando URL...)");
  }
  console.log("==================================================");
  console.log("Las URLs cambian cada vez que reinicias el tunel.\n");
};

const killTree = (child) => {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  } else {
    child.kill("SIGTERM");
  }
};

let anunciado = false;
const maybeAnnounce = () => {
  if (!anunciado && targets.every((t) => t.url)) {
    anunciado = true;
    printSummary();
  }
};

for (const target of targets) {
  const child = spawn(
    "cloudflared",
    [
      "tunnel",
      "--url",
      `http://localhost:${target.port}`,
      "--no-autoupdate",
    ],
    { windowsHide: true },
  );
  target.child = child;

  const onData = (data) => {
    const text = data.toString();
    process.stdout.write(`[${target.name}] ${text}`);
    if (!target.url) {
      const match = text.match(URL_RE);
      if (match) {
        target.url = match[0];
        console.log(`\n[${target.name}] URL publica: ${target.url}\n`);
        maybeAnnounce();
      }
    }
  };

  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", (error) => {
    console.error(`[${target.name}] error: ${error.message}`);
  });
  child.on("exit", (code) => {
    console.log(`[${target.name}] cloudflared termino (codigo ${code})`);
  });
}

// Al cerrar el script (Ctrl+C), cierra también los túneles.
const shutdown = () => {
  targets.forEach((t) => killTree(t.child));
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => targets.forEach((t) => killTree(t.child)));

console.log(
  `Levantando tuneles:\n  API -> http://localhost:${API_PORT}\n  WEB -> http://localhost:${WEB_PORT}\n`,
);
