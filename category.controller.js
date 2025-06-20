// DEEPAK ----

const db = require("../database/db");
const { categories ,user} = db;
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");

const fetchCategory = async (req, res) => {
  try {
    const allCategories = await categories.findAll({
      // where: { isActive: true }, // Only fetch active categories
    });

    return res.status(201).json({
      status: true,
      message: "Category fetch successfully.",
      data: allCategories,
    });
  } catch (error) {
    console.error("Fetch Category Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while creating the category.",
      error: error.message,
    });
  }
};

const getProvidersByCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "categoryId is required in params.",
      });
    }

    // Fetch all approved providers from the specified category
    const providers = await user.findAll({
      where: {
        // categoryId: {
        //   [Op.contains]: [categoryId], // This works with PostgreSQL arrays
        // },
        categoryId,
        role: "Provider",
        // isApproved: true, // Optional: Only show approved providers
      },
      attributes: {
        exclude: ["password", "device_token"], // Optional: Hide sensitive fields
      },
      include: [
        {
          association: "category", // From User.associate
          attributes: ["id", "categoryName"],
        },
        {
          association: "user_locations",
        },
      ],
    });

    if (!providers.length) {
      return res.status(404).json({
        status: false,
        message: "No providers found for this category.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Providers fetched successfully.",
      data: providers,
    });
  } catch (error) {
    console.error("Get Providers Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while fetching providers.",
      error: error.message,
    });
  }
};

//** ADMIN */
const createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ status: false, errors: errors.array() });
    }

    const { categoryName } = req.body;

    // Required field check
    if (!categoryName) {
      return res.status(400).json({
        status: false,
        message: "categoryName is required.",
      });
    }

    // Image validation
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "Category image is required.",
      });
    }
    // Base URL for images
    const BASE_URL = `/public/images/`;

    // Extract filenames
    const categoryImage = `${BASE_URL}${req.file.filename}`;

    // Create category
    const newCategory = await categories.create({
      categoryName,
      categoryImage,
    });

    return res.status(201).json({
      status: true,
      message: "Category created successfully.",
      data: newCategory,
    });
  } catch (error) {
    console.error("Create Category Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while creating the category.",
      error: error.message,
    });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Validate ID
    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid categoryId is required in params.",
      });
    }

    // Check if category exists
    const category = await categories.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found.",
      });
    }

    // Delete category
    await category.destroy();

    return res.status(200).json({
      status: true,
      message: "Category deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Category Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while deleting the category.",
      error: error.message,
    });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid categoryId is required in params.",
      });
    }

    const category = await categories.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found.",
      });
    }

    const uploadedFile = req.file;
    console.log(uploadedFile);
    const categoryName = req.body.categoryName;

    // Check if at least one field is provided
    if (!categoryName && !uploadedFile) {
      return res.status(400).json({
        status: false,
        message:
          "At least one field (categoryName or categoryImage) must be provided to update.",
      });
    }

    const updateData = {};

    if (categoryName) {
      updateData.categoryName = categoryName;
    }

    if (uploadedFile) {
      const BASE_URL = `/public/images/`;
      const categoryImagePath = `${BASE_URL}${uploadedFile.filename}`;
      updateData.categoryImage = categoryImagePath;
    }

    await categories.update(updateData, {
      where: { id: categoryId },
    });

    return res.status(200).json({
      status: true,
      message: "Category updated successfully!",
    });
  } catch (error) {
    console.error("Category Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid categoryId is required in params.",
      });
    }

    const category = await categories.findByPk(categoryId);

    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found.",
      });
    }

    // Toggle isActive value
    const updatedStatus = !category.isActive;

    await categories.update(
      { isActive: updatedStatus },
      { where: { id: categoryId } }
    );

    return res.status(200).json({
      status: true,
      message: `Category status toggled to ${
        updatedStatus ? "Active" : "Inactive"
      } successfully!`,
      data: { isActive: updatedStatus },
    });
  } catch (error) {
    console.error("Category Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const fetchAllCategories = async (req, res) => {
  try {
    const { searchText = "", page = 1, limit = 10 } = req.query;
    const whereCondition = {};

    const offset = (page - 1) * limit;
    if (searchText) {
      whereCondition.categoryName = { [Op.iLike]: `%${searchText}%` };
    }

    const { rows: allCategories, count: totalCount } = await categories.findAndCountAll(
      {
        where: whereCondition,
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
      }
    );

    const totalPages = Math.ceil(totalCount / limit);
    return res.status(201).json({
      status: true,
      message: "Category fetch successfully.",
      data: allCategories,
      totalCount,
      page: parseInt(page),
      totalPages,
    });
  } catch (error) {
    console.error("Fetch Category Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while creating the category.",
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  fetchCategory,
  deleteCategory,
  updateCategory,
  toggleStatus,
  fetchAllCategories,
  getProvidersByCategoryId,
};
