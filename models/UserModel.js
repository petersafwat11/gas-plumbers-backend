const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Please provide a username"],
      trim: true,
      minlength: [1, "Username cannot be empty"],
    },
    email: {
      type: String,
      required: [true, "Please provide an email"],
      unique: true,
      lowercase: true,
      validate: {
        validator: function (email) {
          return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
        },
        message: "Please provide a valid email",
      },
    },
    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, "Please confirm your password"],
      minlength: [8, "Password confirmation must be at least 8 characters"],
      validate: {
        validator: function (el) {
          return el === this.password;
        },
        message: "Passwords are not the same",
      },
    },
    role: {
      type: String,
      enum: {
        values: ["customer", "engineer", "admin"],
        message: "Role must be either customer, engineer, or admin",
      },
      default: "customer",
    },
    phoneNumber: {
      type: String,
      required: [true, "Please provide a phone number"],
      validate: {
        validator: function (phone) {
          // UK phone number validation
          return /^(\+44\s?|0)[0-9\s\-]{9,}$/.test(phone);
        },
        message: "Please provide a valid UK phone number",
      },
    },
    location: {
      address: {
        type: String,
        required: [true, "Please provide an address"],
        trim: true,
        minlength: [1, "Address cannot be empty"],
      },
      city: {
        type: String,
        required: [true, "Please provide a city"],
        trim: true,
        minlength: [1, "City cannot be empty"],
      },
      zipCode: {
        type: String,
        required: [true, "Please provide a postcode"],
        trim: true,
        validate: {
          validator: function (zipCode) {
            // UK postcode validation
            return /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i.test(zipCode);
          },
          message: "Please provide a valid UK postcode",
        },
      },
      country: {
        type: String,
        required: [true, "Please provide a country"],
        default: "United Kingdom",
        trim: true,
      },
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
  }
);

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
