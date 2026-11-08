const { OAuth2Client } = require("google-auth-library");
const { Usuarios } = require("../DataBase/models/index.js");
const { JWT_SECRET, GOOGLE_MAIL_FROM } = require("../config.js");

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

const redirectUri = () => {
  if (process.env.NODE_ENV === "production") {
    return `${process.env.BACKEND_URL || ""}/api/admin/campaigns/oauth/callback`;
  }
  return "http://localhost:3000/api/admin/campaigns/oauth/callback";
};

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

  await Usuarios.update(
    { gmailRefreshToken: tokens.refresh_token },
    { where: { id: userId } },
  );

  return tokens;
};

// Verifica si el admin ya autorizó Gmail.
const hasRefreshToken = async (userId) => {
  const user = await Usuarios.findByPk(userId, {
    attributes: ["gmailRefreshToken"],
  });
  return Boolean(user?.gmailRefreshToken);
};

// Construye el mensaje RFC 2822 y lo envía vía Gmail API.
const sendEmail = async ({ to, subject, body, refreshToken }) => {
  const client = getClient();
  client.setCredentials({ refresh_token: refreshToken });

  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) throw new Error("No se pudo obtener access token de Google.");

  const from = GOOGLE_MAIL_FROM || "bygionay.88@gmail.com";
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");

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
  sendEmail,
  SCOPES,
};
