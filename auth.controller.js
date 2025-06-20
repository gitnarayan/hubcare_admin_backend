const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const db = require("../database/db");
const getIPAddress = require("../utils/ipAddress");
const { sendOTP, verifyOTP } = require("../utils/generateOtp");
require("dotenv").config();
const DEFAULT_PROFILE_IMAGE = "/public/images/1742295005946.png";

const signupController = async (req, res) => {
  try {
    const {
      companyname,
      name,
      email,
      phone,
      password,
      companyaddress,
      role,
      categoryId,
    } = req.body;

    // Required fields validation
    if (!name || !email || !password || !phone || !role) {
      return res.status(400).json({
        status: false,
        error: "All fields are required!",
      });
    }

    if (role === "Provider" && !categoryId) {
      return res.status(400).json({
        status: false,
        error: "Category is required for Providers!",
      });
    }

    // Check if email already exists
    const existingUser = await db.user.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        error: "Email already registered!",
      });
    }

    // Extract uploaded files (documents)
    const { govtId, supportingDocument, nationalId } = req.files || {};

    const BASE_URL = `/public/images/`;

    // Generate file URLs only if files exist
    const govtIdUrl = govtId?.[0]?.filename
      ? `${BASE_URL}${govtId[0].filename}`
      : null;
    const supportingDocumentUrl = supportingDocument?.[0]?.filename
      ? `${BASE_URL}${supportingDocument[0].filename}`
      : null;
    const nationalIdUrl = nationalId?.[0]?.filename
      ? `${BASE_URL}${nationalId[0].filename}`
      : null;

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newProvider = await db.user.create({
      companyname,
      name,
      email,
      phone,
      password: hashedPassword,
      companyaddress,
      role,
      govtId: govtIdUrl,
      supportingDocument: supportingDocumentUrl,
      nationalId: nationalIdUrl,
      categoryId, // categoryId stored Provider ragiester
    });

    const token = jwt.sign(
      { id: newProvider.id, role: newProvider.role }, // Payload: user ID and role.
      process.env.JWT_SECRET // Secret key for signing the token.
      // { expiresIn: "9h" } // Token expiration time (1 hour in this case).
    );

    console.log("token", token);

    res.status(201).json({
      status: true,
      message: "User registered successfully!",
      token,
      newProvider,
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      status: false,
      error: "Internal server error",
    });
  }
};

const login = async (req, res) => {
  try {
    // Extracting `email` and `password` from the request body. This is the user's input for login.
    const { email, password } = req.body;

    // Finding a user (admin) in the database whose email matches the input email.
    // The `db.user.findOne` method queries the database using Sequelize ORM.
    const User = await db.user.findOne({ where: { email } });

    // If no user is found with the given email, send a 400 response with a "Email not found!" message.
    if (!User) {
      return res.status(400).json({ message: "Email not found!" });
    }

    // Comparing the input password with the hashed password stored in the database.
    // `bcrypt.compare` checks if the plain text password matches the hashed password.
    const isMatch = await bcrypt.compare(password, User.password);

    // If the password doesn't match, send a 400 response with an "Invalid password" message.
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Generating a JSON Web Token (JWT) for authentication.
    // The token includes the user's ID and role as payload, signed with a secret key from environment variables.
    const token = jwt.sign(
      { id: User.id , role:User.role }, // Payload: user ID and role.
      process.env.JWT_SECRET, // Secret key for signing the token.
      // { expiresIn: "9h" } // Token expiration time (1 hour in this case).
    );

    console.log("token", token);

    let userWallet = await db.wallet.findOne({ where: { userId: User.id } });

    if (!userWallet) {
      userWallet = await db.wallet.create({ userId: User.id });
      console.log("New wallet created for user:", User.id);
    }
    
    const session =await db.user_session.create({
      userId: User.id,
      loginTime: new Date(),
    });
    
    console.log(session)
    // Sending a successful response with a message, user ID, and the generated token.
    res.status(200).json({
      message: "Login successful",
      status: true,
      data: {
        userId: User.id,
        userRole: User.role,
        token: token,
      },
    });
  } catch (error) {
    console.error("Error in signUp:", error.message);
    return res.status(500).json({
      message: "Internal server error",
      status: false,
      error: error.message,
    });
  }
};

const sendOtpController = async (req, res) => {
  // console.log("...................., ", req.body);

  try {
    const { phoneNumber, deviceType, deviceToken } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ error: "Phone number is required!" });

    const response = await sendOTP(phoneNumber, deviceType, deviceToken);
    res.json(response);
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
};

const verifyOtpController = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp)
      return res
        .status(400)
        .json({ error: "Phone number and OTP are required!" });

    const response = await verifyOTP(phoneNumber, otp);
    res.json(response);
  } catch (error) {
    res.status(400).json({ status: false, error: error.message });
  }
};

const socialLogin = async (req, res) => {
  try {
    const {
      socialId,

      device_type,
      device_token,
      role = "User",
    } = req.body;
    console.log(socialId, device_type, device_token);

    if (!socialId) {
      return res.status(400).json({ error: "provide socialId" });
    }
    let user = await db.user.findOne({ where: { socialId } });
    console.log("ffffffffffffff");

    if (!user) {
      user = await db.user.create({
        socialId,
        device_type,
        device_token,
        role: role,
      });
      console.log(" New user created:", user);
    } else {
      console.log(" Existing user found:", user);
    }
    // Check if the user has a complete profile
    // const isProfile = user.name || user.email ? 1 : 0;

    //  Check if user is approved (govtId, supportingDocument, nationalId required)

    // const isApproved =
    //   user.govtId && user.supportingDocument && user.nationalId ? 1 : 0;
    // if (user.isApproved !== isApproved) {
    //   await user.update({ isApproved });
    // }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET
    );

    await db.user_session.create({
      userId: user.id,
      loginTime: new Date(),
    });

    return res.status(200).json({
      message: "Login successful",
      data: {
        accessToken,
        user,
        // isProfile,
        // isApproved,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const logOut =async (req, res) => {
  try {
    const { id } = req.user; 
    await db.user_session.update(
      { logoutTime: new Date() },
      {
        where: {
          userId:id,
          logoutTime: null,
        },
        order: [['loginTime', 'DESC']],
        limit: 1,
      }
    );  
    res.status(200).json({status: true, message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error:error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const id = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new passwords are required" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password cannot be the same as the current password",
      });
    }

    // Fetch the user from the database
    const user = await db.user.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(" Stored Password from DB:", user.password);
    console.log(" Entered Current Password:", currentPassword);

    // Check if stored password is hashed
    if (!user.password.startsWith("$2b$")) {
      console.error(" Error: Stored password is not hashed correctly.");
      return res
        .status(400)
        .json({ message: "Invalid password format. Reset your password." });
    }

    // Compare current password with stored password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    console.log("🟢 Password Match Result:", isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash the new password before updating
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    console.log("New Hashed Password:", hashedPassword);

    // Update the password in the database
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error(" Error changing password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const userUpdateProfile = async (req, res) => {
  try {
    const { id } = req.user; // Get the user ID from the request
    console.log("User ID:", id);

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const { name, email, phone } = req.body;

    const profileImage = req.file ? req.file.filename : DEFAULT_PROFILE_IMAGE; // Ensure correct file handling
    console.log("Uploaded File:", profileImage);

    // const IpAddress = getIPAddress();
    // http://${IpAddress}:3000
    const BASE_URL = `/public/images/`;

    // Find the user by ID
    let user = await db.user.findOne({ where: { id } });

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Prepare update data
    const updatedData = {
      name: name || user.name,
      email: email || user.email,
    };

    //  Phone ko optional rakha
    if (phone) {
      updatedData.phone = phone;
    }

    //  Profile image ko optional rakha
    if (profileImage) {
      updatedData.profile_image = `${BASE_URL}${profileImage}`;
    }

    // Update user details
    await user.update(updatedData);

    console.log("User profile updated:", updatedData);

    return res.status(200).json({
      status: true,
      message: "User profile updated successfully",
      user: updatedData, // Updated user data return karein
    });
  } catch (error) {
    status: false, console.error("Error updating user profile:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const { id } = req.user;

    if (!id) {
      return res
        .status(400)
        .json({ status: false, message: "User ID is required" });
    }

    console.log("User ID:", id);

    // Find the existing user profile
    const userProfile = await db.user.findOne({ where: { id } });

    if (!userProfile) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Get IP Address and create BASE_URL
    const ipAddress = getIPAddress();
    const BASE_URL = `http://${ipAddress}:3000`;

    // Modify user object to include full profile image URL
    const userResponse = {
      ...userProfile.toJSON(), // Convert Sequelize object to JSON
      profile_image: userProfile.profile_image
        // ? `${BASE_URL}${userProfile.profile_image}`
        // : `${BASE_URL}${DEFAULT_PROFILE_IMAGE}`, // Add BASE_URL to profile image
        ? `${userProfile.profile_image}`
        : `${DEFAULT_PROFILE_IMAGE}`, // Add BASE_URL to profile image
    };

    return res.status(200).json({
      status: true,
      message: "User profile retrieved successfully!",
      user: userResponse, // Moved userProfileImg inside user object
    });
  } catch (error) {
    console.error("Error retrieving user profile:", error);
    return res.status(500).json({
      status: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

const providerUpdateProfile = async (req, res) => {
  try {
    const { id } = req.user; // Get logged-in user ID
    console.log("User ID:", id);

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const { name, email, phone, companyname, discription, categoryId,companyaddress } =
      req.body;

    // const IpAddress = getIPAddress();
    // http://${IpAddress}:3000
    const BASE_URL = `/public/images/`;

    // Find the user by ID
    let user = await db.user.findOne({ where: { id } });
    console.log("User Data:", user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedData = {
      name: name || user.name,
      email: email || user.email,
      phone: phone || user.phone,
      companyname: companyname || user.companyname,
      discription: discription || user.discription,
      categoryId: categoryId || user.categoryId,
      companyaddress : companyaddress || user.companyaddress,
    };

    //  Handle optional file uploads safely
    if (req.files) {
      if (req.files.profileImage?.[0]?.filename) {
        updatedData.profile_image = `${BASE_URL}${req.files.profileImage[0].filename}`;
      }
      if (req.files.govtId?.[0]?.filename) {
        updatedData.govtId = `${BASE_URL}${req.files.govtId[0].filename}`;
      }
      if (req.files.supportingDocument?.[0]?.filename) {
        updatedData.supportingDocument = `${BASE_URL}${req.files.supportingDocument[0].filename}`;
      }
      if (req.files.nationalId?.[0]?.filename) {
        updatedData.nationalId = `${BASE_URL}${req.files.nationalId[0].filename}`;
      }
    }

    await user.update(updatedData);
    console.log("User profile updated:", updatedData);

    return res.status(200).json({
      status: true,
      message: "Provider profile updated successfully",
      user: updatedData,
    });
  } catch (error) {
    console.error("Error updating provider profile:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update profile",
    });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ status: false, message: "Email is required" });
    }

    // Check if user exists
    const user = await db.user.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(" Generated OTP:", otp);

    //  Store OTP in database (Do NOT overwrite password)
    const hashedOTP = await bcrypt.hash(otp, 10);
    user.password = hashedOTP;
    await user.save();

    //  Configure Nodemailer
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
      },
    });

    //  Verify SMTP Connection Before Sending Email
    try {
      await transporter.verify();
      console.log(" SMTP Server is ready!");
    } catch (smtpError) {
      console.error(" SMTP Connection Failed:", smtpError);
      return res.status(500).json({
        status: false,
        message: "Failed to connect to email server.",
      });
    }

    //  Send OTP Email
    try {
      let info = await transporter.sendMail({
        from: process.env.EMAIL,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP code is: ${otp}\n\nIt will expire in 10 minutes.`,
      });

      console.log(" OTP sent successfully: ", info.response);
    } catch (emailError) {
      console.error(" Nodemailer Error:", emailError);
      return res.status(500).json({
        status: false,
        message: "Failed to send OTP. Please try again.",
      });
    }

    //  Return response
    return res.json({
      status: true,
      message: "OTP sent to your email.",
      otp: otp,
    });
  } catch (error) {
    console.error(" Forgot Password Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  signupController,
  login,
  sendOtpController,
  verifyOtpController,
  socialLogin,
  changePassword,
  userUpdateProfile,
  providerUpdateProfile,
  getUserProfile,
  logOut,
  forgotPassword,
};
