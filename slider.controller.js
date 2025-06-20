const db = require("../database/db");
const { sliders } = db;

const createSlider = async (req, res) => {
  try {
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ status: false, message: "Admins only." });
    }

    const existing = await sliders.findOne();
    if (existing) {
      return res
        .status(400)
        .json({ status: false, message: "Slider already exists." });
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "Images are required." });
    }

    const BASE_URL = `/public/images/`;
    const images = req.files.map((file) => `${BASE_URL}${file.filename}`);

    const newSlider = await sliders.create({ images });

    return res.status(201).json({
      status: true,
      message: "Slider created successfully.",
      data: newSlider,
    });
  } catch (error) {
    console.error("Create Slider Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error.",
      error: error.message,
    });
  }
};

const updateSlider = async (req, res) => {
  try {
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ status: false, message: "Admins only." });
    }

    const { appendImages, imagesToDelete } = req.body;
    const slider = await sliders.findOne();

    if (!slider) {
      return res
        .status(404)
        .json({ status: false, message: "Slider not found." });
    }

    let currentImages = slider.images || [];

    if (imagesToDelete) {
      const indexes = imagesToDelete
        .split(",")
        .map((i) => parseInt(i.trim()))
        .filter((i) => !isNaN(i));
      currentImages = currentImages.filter((_, idx) => !indexes.includes(idx));
    }

    if (req.files && req.files.length > 0) {
      const BASE_URL = `/public/images/`;
      const newImages = req.files.map((file) => `${BASE_URL}${file.filename}`);
      if (appendImages === "true" || appendImages === true) {
        currentImages = [...currentImages, ...newImages];
      } else {
        currentImages = newImages;
      }
    }

    await sliders.update(
      { images: currentImages },
      { where: { id: slider.id } }
    );
    const updatedSlider = await sliders.findByPk(slider.id);

    return res.status(200).json({
      status: true,
      message: "Slider updated successfully.",
      data: updatedSlider,
    });
  } catch (error) {
    console.error("Update Slider Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error.",
      error: error.message,
    });
  }
};

const deleteSlider = async (req, res) => {
  try {
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ status: false, message: "Admins only." });
    }

    const slider = await sliders.findOne();

    if (!slider) {
      return res
        .status(404)
        .json({ status: false, message: "Slider not found." });
    }

    await slider.destroy();
    return res
      .status(200)
      .json({ status: true, message: "Slider deleted successfully." });
  } catch (error) {
    console.error("Delete Slider Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error.",
      error: error.message,
    });
  }
};

const getSlider = async (req, res) => {
  try {
    const slider = await sliders.findOne({
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Sliders fetched successfully.",
      data: slider,
    });
  } catch (error) {
    console.error("Fetch Sliders Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error.",
      error: error.message,
    });
  }
};

module.exports = {
  createSlider,
  updateSlider,
  deleteSlider,
  getSlider,
};
