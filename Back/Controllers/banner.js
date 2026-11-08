const { Banner } = require("../DataBase/models/Banner.js");

// Rutas de escritura protegidas con requireAdmin (ver Rutas/banner.js).

const getBanner = async (req, res) => {
  try {
    const Banners = await Banner.findAll();
    if (!Banners || Banners.length === 0) {
      return res.status(404).json({ message: "No hay banners" });
    }
    res.status(200).json(Banners);
  } catch (error) {
    console.error("Error en getBanner:", error);
    res.status(500).json("Error interno del servidor");
  }
};

const addBanner = async (req, res) => {
  try {
    // Convertir array a JSON string igual que en EditBanner
    const newBanner = {
      img: Array.isArray(req.body.img)
        ? JSON.stringify(req.body.img)
        : req.body.img,
      uid: req.user.id,
    };

    const createdBanner = await Banner.create(newBanner);
    res
      .status(201)
      .json({ message: "Banner creado con éxito!", banner: createdBanner });
  } catch (error) {
    console.error("Error en addBanner:", error);
    res.status(500).json("Error interno del servidor del post");
  }
};

const EditBanner = async (req, res) => {
  try {
    const banner = await Banner.findByPk(req.params.id);

    if (!banner) {
      return res.status(404).json("No se encontró el Banner para actualizar");
    }

    // Convertir array a JSON string si es necesario
    banner.img = Array.isArray(req.body.img)
      ? JSON.stringify(req.body.img)
      : req.body.img;
    await banner.save();

    res.status(200).json({ message: "Banner actualizado con éxito!" });
  } catch (error) {
    console.error("Error en EditBanner:", error);
    res.status(500).json("Error interno del servidor");
  }
};

const deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findByPk(req.params.id);

    if (!banner) {
      return res.status(404).json("No se encontró el Banner");
    }

    await banner.destroy();
    return res.json("Banner eliminado con éxito!");
  } catch (error) {
    console.error("Error en deleteBanner:", error);
    return res.status(500).json("Error en el servidor");
  }
};

module.exports = {
  getBanner,
  addBanner,
  EditBanner,
  deleteBanner,
};
