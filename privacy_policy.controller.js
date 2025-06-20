const db = require("../database/db");
const PrivacyPolicy = db.privacy_policy;

//** USER */
const getPrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findOne();
    res.status(200).json({ status: true, data: policy });
  } catch (err) {
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};


//** ADMIN */
const createPrivacyPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content ) {
        return res.status(400).json({
          status: false,
          message: "content is required.",
        });
      }
    const existing = await PrivacyPolicy.findOne();

    if (existing) {
      return res.status(400).json({ status: false, message: "Policy already exists. Use update instead." });
    }

    const policy = await PrivacyPolicy.create({ content });
    res.status(201).json({ status: true, message: "Policy created", data: policy });
  } catch (err) {
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

const updatePrivacyPolicy = async (req, res) => {
  try {
    const { content } = req.body;
    let policy = await PrivacyPolicy.findOne();

    if (!policy) {
      return res.status(404).json({ status: false, message: "Policy not found. Use create instead." });
    }

    policy.content = content;
    await policy.save();

    res.status(200).json({ status: true, message: "Policy updated", data: policy });
  } catch (err) {
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

const deletePrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findOne();
    if (!policy) {
      return res.status(404).json({ status: false, message: "Policy not found" });
    }

    await policy.destroy();
    res.status(200).json({ status: true, message: "Policy deleted" });
  } catch (err) {
    res.status(500).json({ status: false, message: "Server error", error: err.message });
  }
};

module.exports = {
  getPrivacyPolicy,
  createPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
};
