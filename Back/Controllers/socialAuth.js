const { Usuarios } = require("../DataBase/models/Usuarios.js");
const { OAuth2Client } = require("google-auth-library");
const { issueSession } = require("./auth.js");
const {
  GOOGLE_CLIENT_ID,
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
} = require("../config.js");

//? Login con Google (Google Identity Services)
// El frontend envia el "credential" (ID token JWT firmado por Google).
// El backend verifica firma, audiencia y emisor con la libreria oficial.
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (typeof credential !== "string" || !credential) {
      return res.status(400).json("Credencial de Google requerida");
    }
    if (!GOOGLE_CLIENT_ID) {
      return res.status(503).json("Login con Google no está configurado");
    }

    const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID, // valida que el token sea para NUESTRA app
      });
      payload = ticket.getPayload();
    } catch {
      return res
        .status(401)
        .json("Token de Google inválido, expirado o manipulado");
    }

    const email = payload.email ? payload.email.toLowerCase() : null;
    // Sin correo verificado por Google no se crea ni vincula nada.
    if (!email || payload.email_verified !== true) {
      return res
        .status(422)
        .json(
          "Google no entregó un correo verificado. Usa el registro tradicional."
        );
    }

    // 1) Identidad ya vinculada? -> login directo
    let user = await Usuarios.findOne({ where: { googleId: payload.sub } });

    if (!user) {
      // 2) Cuenta existente con el mismo correo (estrategia aprobada:
      //    Google verifica el email -> se permite auto-vincular)
      const byEmail = await Usuarios.findOne({ where: { email } });
      if (byEmail) {
        byEmail.googleId = payload.sub;
        if (!byEmail.image && payload.picture) byEmail.image = payload.picture;
        await byEmail.save();
        user = byEmail;
      } else {
        // 3) Usuario totalmente nuevo
        user = await Usuarios.create({
          email,
          googleId: payload.sub,
          username: null,
          password: null,
          name: payload.given_name || null,
          lastName: payload.family_name || null,
          image: payload.picture || null,
        });
      }
    }

    return issueSession(res, user);
  } catch (error) {
    console.error("Error en login con Google:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

//? Login con Facebook (SDK oficial de Facebook, sin librerias de terceros)
// El frontend envia el accessToken de corta duracion. El backend lo valida
// contra el Graph API con el app token (appId|appSecret, secreto solo backend).
const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body || {};
    if (typeof accessToken !== "string" || !accessToken) {
      return res.status(400).json("Token de Facebook requerido");
    }
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      return res.status(503).json("Login con Facebook no está configurado");
    }
    if (typeof fetch !== "function") {
      return res
        .status(500)
        .json("El servidor requiere Node.js 18 o superior (fetch nativo)");
    }

    // 1) Validar el token contra Facebook: app_id correcta y token vigente
    const appToken = `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`;
    const debugUrl = new URL("https://graph.facebook.com/debug_token");
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", appToken);

    const debugRes = await fetch(debugUrl);
    const debugData = await debugRes.json();
    if (
      !debugRes.ok ||
      !debugData?.data?.is_valid ||
      debugData.data.app_id !== FACEBOOK_APP_ID ||
      !debugData.data.user_id
    ) {
      return res
        .status(401)
        .json("Token de Facebook inválido, expirado o manipulado");
    }

    const facebookId = debugData.data.user_id;

    // 2) Obtener el perfil con el token del usuario y confirmar el id
    const meUrl = new URL("https://graph.facebook.com/me");
    meUrl.searchParams.set(
      "fields",
      "id,first_name,last_name,email,picture.type(large)"
    );
    meUrl.searchParams.set("access_token", accessToken);

    const meRes = await fetch(meUrl);
    const profile = await meRes.json();
    if (!meRes.ok || !profile?.id || profile.id !== facebookId) {
      return res
        .status(401)
        .json("No se pudo validar la identidad de Facebook");
    }

    // 3) Identidad ya vinculada? -> login directo
    let user = await Usuarios.findOne({ where: { facebookId } });

    if (!user) {
      // Facebook NO auto-vincula por correo (estrategia aprobada: solo Google).
      if (!profile.email) {
        return res
          .status(422)
          .json(
            "Facebook no entregó un correo electrónico. Usa el registro tradicional."
          );
      }
      const byEmail = await Usuarios.findOne({
        where: { email: profile.email.toLowerCase() },
      });
      if (byEmail) {
        return res
          .status(409)
          .json(
            "Este correo ya tiene una cuenta. Inicia sesión con tu método original."
          );
      }
      user = await Usuarios.create({
        email: profile.email.toLowerCase(),
        facebookId,
        username: null,
        password: null,
        name: profile.first_name || null,
        lastName: profile.last_name || null,
        image: profile.picture?.data?.url || null,
      });
    }

    return issueSession(res, user);
  } catch (error) {
    console.error("Error en login con Facebook:", error.message);
    return res.status(500).json("Error interno del servidor");
  }
};

module.exports = { googleLogin, facebookLogin };
