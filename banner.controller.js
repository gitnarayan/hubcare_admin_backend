const db = require("../database/db");
const { banners } = db;

const createBanner = async (req, res) => {
  try {
    if (req.user?.role !== "Admin")
      return res.status(403).json({ status: false, message: "Admins only." });

    if (!req.file)
      return res
        .status(400)
        .json({ status: false, message: "Image is required." });

    const { title } = req.body;
    const image = `/public/images/${req.file.filename}`;

    const banner = await banners.create({ title, image });

    return res
      .status(201)
      .json({ status: true, message: "Banner created.", data: banner });
  } catch (error) {
    return res
      .status(500)
      .json({
        status: false,
        message: "Internal error.",
        error: error.message,
      });
  }
};

const getBanners = async (req, res) => {
  try {
    const all = await banners.findAll({
      attributes: ["id", "title", "image"], // Only select these fields
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ status: true, data: all });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Internal error.",
      error: error.message,
    });
  }
};

const deleteBanner = async (req, res) => {
  try {
    if (req.user?.role !== "Admin")
      return res.status(403).json({ status: false, message: "Admins only." });

    const { id } = req.params;
    const banner = await banners.findByPk(id);

    if (!banner)
      return res
        .status(404)
        .json({ status: false, message: "Banner not found." });

    await banner.destroy();
    return res.status(200).json({ status: true, message: "Banner deleted." });
  } catch (error) {
    return res
      .status(500)
      .json({
        status: false,
        message: "Internal error.",
        error: error.message,
      });
  }
};

module.exports = { createBanner, getBanners, deleteBanner };
