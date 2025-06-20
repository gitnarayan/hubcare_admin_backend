// DEEPAK ----

const db = require("../database/db");
const {
  sub_categories,
  subCategory_services,
  user,
  review_ratings,
  booking_service,
} = db;
const { Op } = require("sequelize");

// PROVIDER ----
const createService = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const providerId = req.user?.id;
    if (userRole !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Provider only.",
      });
    }

    const provider = await user.findByPk(providerId);
    if (!provider || provider.role !== "Provider") {
      return res.status(404).json({
        status: false,
        message: "Provided providerId does not exist or is not a Provider.",
      });
    }

    const { subCategoryId } = req.params;
    const { serviceName, serviceDescription, servicePrice } = req.body;

    if (!subCategoryId) {
      return res.status(400).json({
        status: false,
        message: "subCategoryId is required in params.",
      });
    }

    if (!serviceName) {
      return res.status(400).json({
        status: false,
        message: "serviceName is required.",
      });
    }

    const subCategory = await sub_categories.findByPk(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({
        status: false,
        message: "Sub-category not found.",
      });
    }

    let serviceImages = [];
    if (req.files && req.files.length > 0) {
      const BASE_URL = `/public/images/`;
      serviceImages = req.files.map((file) => `${BASE_URL}${file.filename}`);
    }

    const newService = await subCategory_services.create({
      providerId,
      subCategoryId,
      serviceName,
      serviceDescription,
      servicePrice,
      serviceImages,
    });

    return res.status(201).json({
      status: true,
      message: "Service created successfully.",
      data: newService,
    });
  } catch (error) {
    console.error("Create Service Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error while creating service.",
      error: error.message,
    });
  }
};

const deleteService = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Provider only.",
      });
    }

    const { serviceId } = req.params;

    // Validate ID
    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "A valid serviceId is required in params.",
      });
    }

    // Check if service exists
    const service = await subCategory_services.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({
        status: false,
        message: "service not found.",
      });
    }

    // Delete service
    await service.destroy();

    return res.status(200).json({
      status: true,
      message: "service deleted successfully.",
    });
  } catch (error) {
    console.error("Delete service Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while deleting the service.",
      error: error.message,
    });
  }
};

const updateService = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Provider only.",
      });
    }

    const { serviceId } = req.params;
    const {
      serviceName,
      serviceDescription,
      servicePrice,
      subCategoryId,
      appendImages,
      imagesToDelete,
    } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "A valid serviceId is required in params.",
      });
    }

    const service = await subCategory_services.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found.",
      });
    }

    // Ensure at least one field is provided for update
    const hasUpdateField =
      serviceName ||
      serviceDescription ||
      servicePrice ||
      subCategoryId ||
      (req.files && req.files.length > 0) ||
      imagesToDelete;
    if (!hasUpdateField) {
      return res.status(400).json({
        status: false,
        message:
          "At least one field (serviceName, serviceDescription, servicePrice, subCategoryId, or serviceImages) must be provided to update.",
      });
    }

    const updateData = {};

    if (serviceName) updateData.serviceName = serviceName;
    if (serviceDescription) updateData.serviceDescription = serviceDescription;
    if (servicePrice) updateData.servicePrice = servicePrice;

    if (subCategoryId) {
      const subCategory = await sub_categories.findByPk(subCategoryId);
      if (!subCategory) {
        return res.status(404).json({
          status: false,
          message: "Provided subCategoryId does not exist.",
        });
      }
      updateData.subCategoryId = subCategoryId;
    }

    // Prepare image array
    let currentImages = service.serviceImages || [];

    // Delete selected images by index
    if (imagesToDelete) {
      try {
        // // [0 , 1 ]
        // const indexesToRemove = JSON.parse(imagesToDelete);

        // if (!Array.isArray(indexesToRemove)) {
        //   return res.status(400).json({
        //     status: false,
        //     message: "imagesToDelete must be a valid JSON array of indexes.",
        //   });
        // }

        // //

        const indexesToRemove = imagesToDelete
          .split(",")
          .map((i) => parseInt(i.trim()))
          .filter((i) => !isNaN(i));

        currentImages = currentImages.filter(
          (_, index) => !indexesToRemove.includes(index)
        );
      } catch (err) {
        return res.status(400).json({
          status: false,
          message: "Invalid JSON format for imagesToDelete.",
          error: err.message,
        });
      }
    }

    // Handle uploaded new images
    if (req.files && req.files.length > 0) {
      const BASE_URL = `/public/images/`;
      const newImages = req.files.map((file) => `${BASE_URL}${file.filename}`);

      if (appendImages === "true" || appendImages === true) {
        currentImages = [...currentImages, ...newImages];
      } else {
        currentImages = newImages; // replace all
      }
    }

    // Save updated image array
    updateData.serviceImages = currentImages;

    // Ensure at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "At least one field must be provided to update.",
      });
    }

    await subCategory_services.update(updateData, {
      where: { id: serviceId },
    });

    const updatedService = await subCategory_services.findByPk(serviceId);

    return res.status(200).json({
      status: true,
      message: "Service updated successfully!",
      data: updatedService,
    });
  } catch (error) {
    console.error("Service Update Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal error while updating service.",
      error: error.message,
    });
  }
};

// Service Apply PromoCode
const togglePromoCode = async (req, res) => {
  try {
    const userRole = req.user?.role;
    if (userRole !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Access denied. Provider only.",
      });
    }

    const { serviceId } = req.params;
    let { applyPromo } = req.body;

    if (typeof applyPromo === "string") {
      applyPromo = applyPromo.toLowerCase() === "true";
    } else {
      applyPromo = !!applyPromo;
    }

    if (typeof applyPromo !== "boolean") {
      return res.status(400).json({
        status: false,
        message: "`applyPromo` must be a boolean value (true or false).",
      });
    }

    const service = await subCategory_services.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found.",
      });
    }

    service.isPromocodeApplied = applyPromo;
    await service.save();

    return res.status(200).json({
      status: true,
      message: `Promo code ${applyPromo ? "applied" : "removed"} successfully.`,
    });
  } catch (error) {
    console.error("Promo toggle error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/** USER---- */

// subCategoryId Base fetch Services
const getServicesBySubCategory = async (req, res) => {
  try {
    const { subCategoryId } = req.params;

    const services = await subCategory_services.findAll({
      where: { subCategoryId },
    });

    return res.status(200).json({
      status: true,
      message: "Services fetched successfully.",
      data: services,
    });
  } catch (error) {
    console.error("Fetch Services Error:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to fetch services.",
      error: error.message,
    });
  }
};

// ID Base service
const getServices = async (req, res) => {
  try {
    const { serviceId } = req.params;

    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "serviceId is required in params.",
      });
    }

    // const service = await subCategory_services.findByPk(serviceId);

    const service = await subCategory_services.findByPk(serviceId, {
      include: [
        {
          model: user,
          as: "provider",
          attributes: [
            "id",
            "name",
            "discription",
            "profile_image",
            "companyaddress",
          ],
        },
        {
          model: review_ratings,
          as: "providerReviews",
          attributes: ["rating"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found.",
      });
    }

    // Calculate average rating and total reviews
    const providerReviews = service.providerReviews || [];
    const totalReviews = providerReviews.length;

    let averageRating = 0;
    if (totalReviews > 0) {
      const sumRating = providerReviews.reduce((sum, r) => sum + r.rating, 0);
      averageRating = parseFloat((sumRating / totalReviews).toFixed(2));
    }

    // Convert to plain object and remove providerReviews
    const responseData = service.toJSON();
    delete responseData.providerReviews; // hide reviews in response

    // Add calculated rating details
    responseData.averageRating = averageRating;
    responseData.totalReviews = totalReviews;

    return res.status(200).json({
      status: true,
      message: "Service fetched successfully.",
      data: responseData,
    });
  } catch (error) {
    console.error("Fetch Service Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while fetching the service.",
      error: error.message,
    });
  }
};

// All Services With Filters {sort, minPrice, maxPrice, search}
const getAllServices = async (req, res) => {
  try {
    const { sort, minPrice, maxPrice, search } = req.query;

    // Build "where" condition
    let whereCondition = {};

    if (search) {
      whereCondition.serviceName = {
        [Op.iLike]: `%${search}%`,
      };
    }

    if (minPrice || maxPrice) {
      whereCondition.servicePrice = {};
      if (minPrice) whereCondition.servicePrice[Op.gte] = parseFloat(minPrice);
      if (maxPrice) whereCondition.servicePrice[Op.lte] = parseFloat(maxPrice);
    }

    // Build order condition
    let order = [];
    if (sort === "asc") {
      order = [["servicePrice", "ASC"]];
    } else if (sort === "desc") {
      order = [["servicePrice", "DESC"]];
    }

    const allServices = await subCategory_services.findAll({
      where: whereCondition,
      order,
    });

    return res.status(200).json({
      status: true,
      message: "Services fetched successfully.",
      data: allServices,
    });
  } catch (error) {
    console.error("Fetch Services Error:", error);
    return res.status(500).json({
      status: false,
      message: "Something went wrong while fetching the Services.",
      error: error.message,
    });
  }
};

// Rating Upadate Service Based
const updateServiceRating = async (req, res) => {
  const { serviceId } = req.params;
  const { newRating } = req.body;

  try {
    const service = await subCategory_services.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Calculate new average rating
    const totalRating = service.rating * service.ratingCount;
    const updatedCount = service.ratingCount + 1;
    const updatedAverage = (totalRating + newRating) / updatedCount;

    // Save updated rating and count
    service.rating = parseFloat(updatedAverage.toFixed(2));
    service.ratingCount = updatedCount;

    await service.save();

    res.status(200).json({
      status: true,
      message: "Rating added successfully",
      updatedRating: service.rating,
      totalRatings: service.ratingCount,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error updating rating", error: err.message });
  }
};

const getServicesByProvider = async (req, res) => {
  try {
    const { providerId } = req.params;

    if (!providerId) {
      return res.status(400).json({
        status: false,
        message: "providerId is required in params.",
      });
    }

    const provider = await user.findOne({
      where: { id: providerId, role: "Provider" },
      attributes: [
        "id",
        "name",
        "discription",
        "profile_image",
        "role",
        "companyaddress",
      ],
    });
    if (!provider || provider.role !== "Provider") {
      return res.status(404).json({
        status: false,
        message: "Provided providerId does not exist or is not a Provider.",
      });
    }

    const services = await subCategory_services.findAll({
      where: { providerId },
      order: [["createdAt", "DESC"]],
    });

    // Get all reviews for this provider
    const providerReviews = await review_ratings.findAll({
      where: { providerId },
      attributes: ["rating"],
    });

    const totalReviews = providerReviews.length;
    const averageRating =
      totalReviews > 0
        ? parseFloat(
            (
              providerReviews.reduce((sum, r) => sum + r.rating, 0) /
              totalReviews
            ).toFixed(2)
          )
        : 0;

    return res.status(200).json({
      status: true,
      message: "Provider services fetched successfully.",
      data: {
        provider: {
          ...provider.toJSON(),
          averageRating,
          totalReviews,
        },
        services,
      },
    });
  } catch (error) {
    console.error("Get Provider Services Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error while fetching services.",
      error: error.message,
    });
  }
};

// Best Services
const getBestServices = async (req, res) => {
  try {
    // Step 1: Fetch all services with reviews and providers
    const services = await subCategory_services.findAll({
      include: [
        {
          model: user,
          as: "provider",
          attributes: ["id", "name", "discription", "profile_image"],
        },
        {
          model: review_ratings,
          as: "providerReviews", // assumes association is correct
        },
      ],
    });

    // Step 2: Compute average rating and filter those with reviews
    const servicesWithRatings = services
      .map((service) => {
        const reviews = service.providerReviews || [];
        const totalReviews = reviews.length;

        if (totalReviews === 0) return null;

        const sumRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = sumRating / totalReviews;

        return {
          ...service.toJSON(),
          averageRating: parseFloat(averageRating.toFixed(2)),
          totalReviews,
        };
      })
      .filter((s) => s !== null);

    // Step 3: Sort by average rating
    const topServices = servicesWithRatings
      .sort((a, b) => b.averageRating - a.averageRating)
      .slice(0, 10); // top 10

    return res.status(200).json({
      status: true,
      message: "Best services fetched successfully.",
      data: topServices,
    });
  } catch (error) {
    console.error("Error in getBestServices:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Services Used
const getServicesUsed = async (req, res) => {
  try {
    const userId = req.user?.id;
    const servicesUsed = await booking_service.findAll({
      where: {
        userId: userId,
        bookingStatus: "COMPLETED",
      },
      include: [
        {
          model: db.subCategory_services,
          as: "service",
          attributes: [
            "id",
            "serviceName",
            "serviceDescription",
            "servicePrice",
            "serviceImages",
            "subCategoryId"
          ],
        },
      ],
      order: [["serviceDate", "DESC"]],
    });
    return res.status(200).json({
      status: true,
      message: "used services fetched successfully.",
      data: servicesUsed,
    });
  } catch (error) {
    console.error("Error in getServicesUsed:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

// Recommended Services based Provider Review
const getRecommendedServices = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const services = await subCategory_services.findAll({
      include: [
        {
          model: sub_categories,
          as: "subCategory",
          attributes: ["id", "subCategoryName"],
        },
        {
          model: user,
          as: "provider",
          attributes: ["id", "name", "profile_image"],
        },
        {
          model: review_ratings,
          as: "providerReviews",
          attributes: ["rating"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
    });

    // Optional: Calculate average rating per service (based on associated reviews)
    const enrichedServices = services.map((service) => {
      const reviews = service.providerReviews || [];
      const total = reviews.reduce((sum, r) => sum + r.rating, 0);
      const averageRating =
        reviews.length > 0 ? (total / reviews.length).toFixed(1) : null;

      return {
        ...service.toJSON(),
        averageRating,
      };
    });

    return res.status(200).json({
      status: true,
      message: "Recommended services fetched successfully",
      data: enrichedServices,
    });
  } catch (error) {
    console.error("Recommended Services Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  //** PROVIDER */
  createService,
  deleteService,
  updateService,
  togglePromoCode,

  //**USER */
  getServicesBySubCategory,
  getServices,
  getAllServices,
  updateServiceRating,
  getServicesByProvider,
  getBestServices,
  getServicesUsed,
  getRecommendedServices,
};
