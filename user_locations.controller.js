// DEEPAK ----

const db = require("../database/db");
const { user_locations } = db;

const locationAdd = async (req, res) => {
  try {
    const { id } = req.user;
    console.log("User ID:", id);

    if (!id) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    const { address, latitude, longitude } = req.body;
    console.log("Received Data:", address, latitude, longitude);

    if (!address || !latitude || !longitude) {
      return res
        .status(400)
        .json({ status: false, message: "All fields are required!" });
    }

    // Create a new location entry
    const newLocation = await user_locations.create({
      address,
      latitude,
      longitude,
      userId: id,
    });

    console.log("Location added successfully:", newLocation);

    return res.status(201).json({
      status: true,
      message: "Location added successfully!",
      data: newLocation,
    });
  } catch (error) {
    console.error("Location Add Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      details: error.message,
    });
  }
};

// All Location
const getLocation = async (req, res) => {
  try {
    const { id } = req.user;

    if (!id) {
      return res.status(401).json({
        status: false,
        message: "User ID is required or unauthorized",
      });
    }

    const locations = await user_locations.findAll({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Locations fetched successfully",
      data: locations,
    });
  } catch (error) {
    console.error("Get Location Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      details: error.message,
    });
  }
};

// only ID Base Location
const getLocationById = async (req, res) => {
  try {
    const { id } = req.user;
    const { locationId } = req.params;

    if (!locationId) {
      return res.status(400).json({
        status: false,
        message: "Location ID is required",
      });
    }

    const location = await user_locations.findOne({
      where: {
        id: locationId,
        userId: id, // Ensures the location belongs to the user
      },
    });

    if (!location) {
      return res.status(404).json({
        status: false,
        message: "Location not found",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Location fetched successfully",
      data: location,
    });
  } catch (error) {
    console.error("Get Location By ID Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      details: error.message,
    });
  }
};

// Delete location By id
const deleteLocationById = async (req, res) => {
  try {
    const { id } = req.user;
    const { locationId } = req.params;

    if (!locationId) {
      return res.status(400).json({
        status: false,
        message: "Location ID is required",
      });
    }

    // Check if the location exists and belongs to the user
    const location = await user_locations.findOne({
      where: {
        id: locationId,
        userId: id,
      },
    });

    if (!location) {
      return res.status(404).json({
        status: false,
        message: "Location not found or not authorized to delete",
      });
    }

    // Delete the location
    await location.destroy();

    return res.status(200).json({
      status: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    console.error("Delete Location Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      details: error.message,
    });
  }
};

module.exports = { locationAdd, getLocation, getLocationById ,deleteLocationById};
