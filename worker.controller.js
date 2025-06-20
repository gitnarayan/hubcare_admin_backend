// DEEPAK ----

const db = require("../database/db");
const { worker,user } = db;
const BASE_URL = `/public/images/`;

const addWorker = async (req, res) => {
  try {
    const providerId = req.user?.id;

    if (req.user.role !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Only providers can add workers.",
      });
    }

    const provider = await user.findByPk(providerId);
    if (!provider || provider.role !== "Provider") {
      return res.status(404).json({
        status: false,
        message: "Provided providerId does not exist or is not a Provider.",
      });
    }

    const { name, email, phone, company_address } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        status: false,
        message: "Name and Email are required.",
      });
    }

    const profile_image = req.file ? `${BASE_URL}${req.file.filename}` : null;

    const newWorker = await worker.create({
      providerId,
      name,
      email,
      phone,
      company_address,
      profile_image,
    });

    return res.status(201).json({
      status: true,
      message: "Worker added successfully.",
      data: newWorker,
    });
  } catch (error) {
    console.error("Add Worker Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const updateWorker = async (req, res) => {
  try {
    const providerId = req.user?.id;
    const { id } = req.params;
    const { name, email, phone, company_address } = req.body;

    if (req.user.role !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Only providers can add workers.",
      });
    }

    const workerToUpdate = await worker.findOne({
      where: { id, providerId },
    });

    if (!workerToUpdate) {
      return res.status(404).json({
        status: false,
        message: "Worker not found or unauthorized access.",
      });
    }

    const profile_image = req.file
      ? `${BASE_URL}${req.file.filename}`
      : workerToUpdate.profile_image;

    await workerToUpdate.update({
      name,
      email,
      phone,
      company_address,
      profile_image,
    });

    return res.status(200).json({
      status: true,
      message: "Worker updated successfully.",
      data: workerToUpdate,
    });
  } catch (error) {
    console.error("Update Worker Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const deleteWorker = async (req, res) => {
  try {
    if (req.user.role !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Only providers can add workers.",
      });
    }
    const providerId = req.user?.id;
    const { id } = req.params;

    const workerToDelete = await worker.findOne({
      where: { id, providerId },
    });

    if (!workerToDelete) {
      return res.status(404).json({
        status: false,
        message: "Worker not found or unauthorized access.",
      });
    }

    await workerToDelete.destroy();

    return res.status(200).json({
      status: true,
      message: "Worker deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Worker Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const allWorkers = async (req, res) => {
  try {
    if (req.user.role !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Only providers can add workers.",
      });
    }
    const providerId = req.user?.id;

    const workers = await worker.findAll({
      where: { providerId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "All workers fetched successfully.",
      data: workers,
    });
  } catch (error) {
    console.error("All Workers Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const workerDetail = async (req, res) => {
  try {
    if (req.user.role !== "Provider") {
      return res.status(403).json({
        status: false,
        message: "Only providers can add workers.",
      });
    }
    const providerId = req.user?.id;
    const { id } = req.params;

    const singleWorker = await worker.findOne({
      where: { id, providerId },
    });

    if (!singleWorker) {
      return res.status(404).json({
        status: false,
        message: "Worker not found or unauthorized access.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Worker detail fetched successfully.",
      data: singleWorker,
    });
  } catch (error) {
    console.error("Worker Detail Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  addWorker,
  updateWorker,
  deleteWorker,
  allWorkers,
  workerDetail,
};
