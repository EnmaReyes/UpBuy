const { OAuth2Client } = require("google-auth-library");
const { Usuarios } = require("../DataBase/models/index.js");
const { GOOGLE_MAIL_FROM } = require("../config.js");
const {
  encryptGmailToken,
  decryptGmailToken,
} = require("./campaigns/tokenVault.js");

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

const redirectUri = () => {
  if (process.env.NODE_ENV === "production") {
    return `${process.env.BACKEND_URL || ""}/api/admin/campaigns/oauth/callback`;
  }
  return "http://localhost:3000/api/admin/campaigns/oauth/callback";
};

// Gmail esta listo para autorizar/enviar: OAuth + clave de cifrado. Sin la
// clave el token no se puede guardar de forma segura, asi que se considera
// "no configurado" y el panel no ofrece conectar.
const isGmailConfigured = () =>
  Boolean(
    process.env.GOOGLE_MAIL_CLIENT_ID &&
      process.env.GOOGLE_MAIL_CLIENT_SECRET &&
      process.env.GMAIL_TOKEN_ENCRYPTION_KEY,
  );

const getClient = () =>
  new OAuth2Client(
    process.env.GOOGLE_MAIL_CLIENT_ID,
    process.env.GOOGLE_MAIL_CLIENT_SECRET,
    redirectUri(),
  );

// Genera la URL de autorización de Google.
const getAuthUrl = (state) => {
  const client = getClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
};

// Intercambia el code por tokens y guarda el refresh_token en el usuario.
const handleCallback = async ({ code, state, expectedState, userId }) => {
  if (!state || state !== expectedState) {
    throw new Error("Estado OAuth inválido (posible CSRF).");
  }

  const client = getClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvió refresh_token. Revoca el acceso en tu cuenta de Google y vuelve a autorizar.",
    );
  }

  // Siempre cifrado: sin GMAIL_TOKEN_ENCRYPTION_KEY no se guarda nada.
  const encrypted = encryptGmailToken(tokens.refresh_token);
  await Usuarios.update(
    { gmailRefreshToken: encrypted },
    { where: { id: userId } },
  );

  return tokens;
};

// Lee el refresh token descifrado del admin (solo para enviar, nunca para
// respuestas ni logs). Devuelve null si no hay token.
const getRefreshToken = async (userId) => {
  const user = await Usuarios.findByPk(userId, {
    attributes: ["gmailRefreshToken"],
  });
  if (!user?.gmailRefreshToken) return null;
  return decryptGmailToken(user.gmailRefreshToken);
};

// Verifica si el admin ya autorizó Gmail.
const hasRefreshToken = async (userId) => {
  const user = await Usuarios.findByPk(userId, {
    attributes: ["gmailRefreshToken"],
  });
  return Boolean(user?.gmailRefreshToken);
};

// Construye el mensaje RFC 2822 y lo envía vía Gmail API. Con `html` se arma
// multipart/alternative: texto plano de respaldo + HTML saneado.
const sendEmail = async ({ to, subject, body, html, refreshToken }) => {
  const client = getClient();
  client.setCredentials({ refresh_token: refreshToken });

  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("No se pudo obtener access token de Google.");

  const from = GOOGLE_MAIL_FROM || "upbuy.official@gmail.com";
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];

  let message;
  if (html) {
    const boundary = `upbuy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    message = [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n");
  }

  // base64url
  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${err}`);
  }

  return res.json();
};

module.exports = {
  getAuthUrl,
  handleCallback,
  hasRefreshToken,
  getRefreshToken,
  isGmailConfigured,
  sendEmail,
  SCOPES,
};
