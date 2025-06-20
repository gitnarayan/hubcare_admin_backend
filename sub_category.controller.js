// DEEPAK ----

const db = require("../database/db");
const { sub_categories, categories,subCategory_services,user } = db;
const { Op } = require("sequelize");

const getCategoryWithSubCategories = async (req, res) => {
  try {
    const { categoryId } = req.params;

    // Validate ID
    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid categoryId is required in params.",
      });
    }

    // Fetch the category with its sub-categories
    const category = await categories.findByPk(categoryId, {
      attributes: ["id", "categoryName", "categoryImage"],
      include: [
        {
          model: sub_categories,
          as: "subCategories",
          attributes: ["id", "subCategoryName", "subCategoryImage"],
          where: { isActive: true }, // Only active sub-categories
          required: false, // So category will return even if it has no active subCategories
        },
      ],
    });

    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Category with sub-categories fetched successfully.",
      data: category,
    });
  } catch (error) {
    console.error("Get Category With SubCategories Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching category.",
      error: error.message,
    });
  }
};

// All Providers fetched with SubCategoryId Based
const getProvidersBySubCategoryId = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    // 2. Find services under that subcategory with provider info
    const services = await subCategory_services.findAll({
      where: { subCategoryId: subCategoryId },
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["id", "name", "email", "phone", "profile_image"],
        },
      ],
    });

    if (!services.length) {
      return res.status(404).json({
        status: false,
        message: "No services found under this subcategory.",
      });
    }

    // 3. Extract unique providers
    const providersMap = {};
    for (const service of services) {
      if (service.provider && !providersMap[service.provider.id]) {
        providersMap[service.provider.id] = await service.provider;
      }
    }

    const uniqueProviders = Object.values(providersMap);

    return res.status(200).json({
      status: true,
      message: "Providers fetched successfully.",
      data: uniqueProviders,
    });
  } catch (error) {
    console.error("Fetch Providers Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch providers.",
      error: error.message,
    });
  }
};

//** ADMIN */
const createSubCategory = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Admins only.",
      });
    }
    const { categoryId } = req.params;

    // Validate ID
    if (!categoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid categoryId is required in params.",
      });
    }

    const { subCategoryName } = req.body;

    // Validate required fields
    if (!subCategoryName) {
      return res.status(400).json({
        status: false,
        message: "subCategoryName are required.",
      });
    }

    // Validate if the category exists
    const categoryExists = await categories.findByPk(categoryId);
    if (!categoryExists) {
      return res.status(404).json({
        status: false,
        message: "Category not found with the provided ID.",
      });
    }

    // Validate image upload
    if (!req.file) {
      return res.status(400).json({
        status: false,
        message: "subCategoryImage is required.",
      });
    }

    // Extract filenames
    const BASE_URL = `/public/images/`;
    const subCategoryImage = `${BASE_URL}${req.file.filename}`;

    // Create the sub-category in the database
    const newSubCategory = await sub_categories.create({
      subCategoryName,
      subCategoryImage,
      categoryId,
    });

    return res.status(201).json({
      status: true,
      message: "Sub-category created successfully.",
      data: newSubCategory,
    });
  } catch (error) {
    console.error("Create SubCategory Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to create sub-category.",
      error: error.message,
    });
  }
};

const deleteSubCategory = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Admins only.",
      });
    }

    const { subCategoryId } = req.params;

    // Validate ID
    if (!subCategoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid subCategoryId is required in params.",
      });
    }

    // Check if subCategory exists
    const subCategory = await sub_categories.findByPk(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message: "subCategory not found.",
      });
    }

    // Delete subCategory
    await subCategory.destroy();

    return res.status(200).json({
      status: true,
      message: "subCategory deleted successfully.",
    });
  } catch (error) {
    console.error("Delete subCategory Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while deleting the subCategory.",
      error: error.message,
    });
  }
};

const updateSubCategory = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Admins only.",
      });
    }

    const { subCategoryId } = req.params;

    if (!subCategoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid subCategoryId is required in params.",
      });
    }

    const subCategory = await sub_categories.findByPk(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message: "subCategory not found.",
      });
    }

    const uploadedFile = req.file;
    const subCategoryName = req.body.subCategoryName;
    const categoryId = req.body.categoryId;

    // Check if at least one field is provided
    if (!subCategoryName && !uploadedFile && !categoryId) {
      return res.status(400).json({
        status: false,
        message:
          "At least one field (subCategoryName ,categoryId or subCategoryImage) must be provided to update.",
      });
    }

    const updateData = {};

    if (subCategoryName) {
      updateData.subCategoryName = subCategoryName;
    }

    if (uploadedFile) {
      const BASE_URL = `/public/images/`;
      const subCategoryImagePath = `${BASE_URL}${uploadedFile.filename}`;
      updateData.subCategoryImage = subCategoryImagePath;
    }

    if (categoryId) {
      // Check if the given categoryId exists
      const categoryExists = await categories.findByPk(categoryId);
      if (!categoryExists) {
        return res.status(404).json({
          status: false,
          message: "Provided categoryId does not exist.",
        });
      }
      updateData.categoryId = categoryId;
    }

    await sub_categories.update(updateData, {
      where: { id: subCategoryId },
    });

    return res.status(200).json({
      status: true,
      message: "subCategory updated successfully!",
    });
  } catch (error) {
    console.error("subCategory Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    if (!subCategoryId) {
      return res.status(400).json({
        status: false,
        message: "A valid subCategoryId is required in params.",
      });
    }

    const subCategory = await sub_categories.findByPk(subCategoryId);

    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message: "subCategory not found.",
      });
    }

    // Toggle isActive value
    const updatedStatus = !subCategory.isActive;

    await sub_categories.update(
      { isActive: updatedStatus },
      { where: { id: subCategoryId } }
    );

    return res.status(200).json({
      status: true,
      message: `subCategory status toggled to ${updatedStatus ? "Active" : "Inactive"} successfully!`,
      data: { isActive: updatedStatus }
    });
  } catch (error) {
    console.error("subCategory Update Error:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const fetchAllSubCategories = async (req, res) => {
  try {
 const { searchText = "", page = 1, limit = 10 } = req.query;
    const whereCondition = {};

    const offset = (page - 1) * limit;
    if (searchText) {
      whereCondition.subCategoryName = { [Op.iLike]: `%${searchText}%` };
    }

    // Fetch the All sub-categories
    const { rows: subCategories, count: totalCount } = await sub_categories.findAndCountAll(
      {
        where: whereCondition,
        include: [
          {
            model: categories,
            as: "category",
            attributes: ["categoryName"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit: parseInt(limit),
        offset: parseInt(offset),
      }
    );

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: true,
      message: "sub-categories fetched successfully.",
      data: subCategories,
      totalCount,
      page: parseInt(page),
      totalPages,
    });
  } catch (error) {
    console.error("Get SubCategories Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching subCategories.",
      error: error.message,
    });
  }
};

module.exports = {
  getCategoryWithSubCategories,
  getProvidersBySubCategoryId,
  createSubCategory,
  deleteSubCategory,
  updateSubCategory,
  toggleStatus,
  fetchAllSubCategories,
};
